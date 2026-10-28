//! Prototype for the 0.9.0 study: snow's Noise `IK` handshake with a PSK
//! (`IKpsk1` or `IKpsk2`, 25519 / ChaCha20-Poly1305 / SHA-256) and the transport that
//! follows, exposed to JavaScript through wasm-bindgen.
//!
//! The guest is the initiator and knows the host's static key from the link;
//! both sides share a PSK derived from the link secret and the passphrase.
//! The PSK position is a parameter because it decides who can test
//! passphrase guesses (see README.md).

use snow::{params::NoiseParams, Builder, HandshakeState, TransportState};
use wasm_bindgen::prelude::*;

const PATTERNS: [&str; 2] = [
    "Noise_IKpsk1_25519_ChaChaPoly_SHA256",
    "Noise_IKpsk2_25519_ChaChaPoly_SHA256",
];
// Noise caps a message at 65535 bytes, including the 16-byte tag.
const MAX_MESSAGE: usize = 65535;
const TAG: usize = 16;
const PSK_LEN: usize = 32;

/// `psk_position` 1 or 2 selects IKpsk1 or IKpsk2.
fn pattern(psk_position: u8) -> Result<&'static str, JsError> {
    match psk_position {
        1 | 2 => Ok(PATTERNS[usize::from(psk_position - 1)]),
        _ => Err(JsError::new("psk position must be 1 or 2")),
    }
}

fn params(name: &str) -> NoiseParams {
    name.parse().expect("valid pattern")
}

fn err(e: impl core::fmt::Display) -> JsError {
    JsError::new(&e.to_string())
}

fn psk(bytes: &[u8]) -> Result<[u8; PSK_LEN], JsError> {
    bytes
        .try_into()
        .map_err(|_| JsError::new("psk must be 32 bytes"))
}

#[wasm_bindgen]
pub fn protocol_name(psk_position: u8) -> Result<String, JsError> {
    pattern(psk_position).map(Into::into)
}

/// A fresh X25519 key pair as `[private(32) || public(32)]`.
#[wasm_bindgen]
pub fn generate_keypair() -> Result<Vec<u8>, JsError> {
    let kp = Builder::new(params(PATTERNS[0]))
        .generate_keypair()
        .map_err(err)?;
    let mut out = kp.private;
    out.extend_from_slice(&kp.public);
    Ok(out)
}

#[wasm_bindgen]
pub struct Handshake {
    state: Option<HandshakeState>,
}

fn build(
    psk_position: u8,
    initiator: bool,
    local_private: &[u8],
    remote_public: Option<&[u8]>,
    psk_bytes: &[u8],
    prologue: &[u8],
    ephemeral: Option<&[u8]>,
) -> Result<Handshake, JsError> {
    let key = psk(psk_bytes)?;
    let mut b = Builder::new(params(pattern(psk_position)?))
        .local_private_key(local_private)
        .map_err(err)?
        .psk(psk_position, &key)
        .map_err(err)?
        .prologue(prologue)
        .map_err(err)?;
    if let Some(rs) = remote_public {
        b = b.remote_public_key(rs).map_err(err)?;
    }
    if let Some(e) = ephemeral {
        b = b.fixed_ephemeral_key_for_testing_only(e);
    }
    let state = if initiator {
        b.build_initiator()
    } else {
        b.build_responder()
    }
    .map_err(err)?;
    Ok(Handshake { state: Some(state) })
}

#[wasm_bindgen]
impl Handshake {
    /// Guest side: knows the host's static public key in advance.
    pub fn initiator(
        psk_position: u8,
        local_private: &[u8],
        remote_public: &[u8],
        psk: &[u8],
        prologue: &[u8],
    ) -> Result<Handshake, JsError> {
        build(
            psk_position,
            true,
            local_private,
            Some(remote_public),
            psk,
            prologue,
            None,
        )
    }

    /// Host side: learns the guest's static key from the first message.
    pub fn responder(
        psk_position: u8,
        local_private: &[u8],
        psk: &[u8],
        prologue: &[u8],
    ) -> Result<Handshake, JsError> {
        build(
            psk_position,
            false,
            local_private,
            None,
            psk,
            prologue,
            None,
        )
    }

    fn state(&mut self) -> Result<&mut HandshakeState, JsError> {
        self.state
            .as_mut()
            .ok_or_else(|| JsError::new("handshake already finished"))
    }

    pub fn write_message(&mut self, payload: &[u8]) -> Result<Vec<u8>, JsError> {
        let mut buf = vec![0u8; MAX_MESSAGE];
        let n = self
            .state()?
            .write_message(payload, &mut buf)
            .map_err(err)?;
        buf.truncate(n);
        Ok(buf)
    }

    pub fn read_message(&mut self, message: &[u8]) -> Result<Vec<u8>, JsError> {
        let mut buf = vec![0u8; MAX_MESSAGE];
        let n = self.state()?.read_message(message, &mut buf).map_err(err)?;
        buf.truncate(n);
        Ok(buf)
    }

    pub fn is_finished(&self) -> bool {
        self.state
            .as_ref()
            .is_some_and(|s| s.is_handshake_finished())
    }

    /// Channel binding value; equal on both sides once the handshake is done.
    pub fn handshake_hash(&self) -> Result<Vec<u8>, JsError> {
        let s = self
            .state
            .as_ref()
            .ok_or_else(|| JsError::new("handshake already finished"))?;
        Ok(s.get_handshake_hash().to_vec())
    }

    /// The peer's static public key (the host learns the guest's here).
    pub fn remote_static(&self) -> Option<Vec<u8>> {
        self.state.as_ref()?.get_remote_static().map(<[u8]>::to_vec)
    }

    /// Ends the handshake; this object cannot be used afterwards.
    pub fn into_transport(&mut self) -> Result<Transport, JsError> {
        let s = self
            .state
            .take()
            .ok_or_else(|| JsError::new("handshake already finished"))?;
        let t = s.into_transport_mode().map_err(err)?;
        Ok(Transport { state: t })
    }
}

#[cfg(feature = "test-vectors")]
#[wasm_bindgen]
impl Handshake {
    /// Test vectors only: both sides with fixed ephemeral keys.
    pub fn initiator_for_vectors(
        psk_position: u8,
        local_private: &[u8],
        remote_public: &[u8],
        psk: &[u8],
        prologue: &[u8],
        ephemeral: &[u8],
    ) -> Result<Handshake, JsError> {
        build(
            psk_position,
            true,
            local_private,
            Some(remote_public),
            psk,
            prologue,
            Some(ephemeral),
        )
    }

    pub fn responder_for_vectors(
        psk_position: u8,
        local_private: &[u8],
        psk: &[u8],
        prologue: &[u8],
        ephemeral: &[u8],
    ) -> Result<Handshake, JsError> {
        build(
            psk_position,
            false,
            local_private,
            None,
            psk,
            prologue,
            Some(ephemeral),
        )
    }
}

/// Encrypts and decrypts application messages after the handshake.
/// Messages must arrive in order: each direction uses a counter nonce.
#[wasm_bindgen]
pub struct Transport {
    state: TransportState,
}

#[wasm_bindgen]
impl Transport {
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, JsError> {
        if plaintext.len() > MAX_MESSAGE - TAG {
            return Err(JsError::new("message too large"));
        }
        let mut buf = vec![0u8; plaintext.len() + TAG];
        let n = self.state.write_message(plaintext, &mut buf).map_err(err)?;
        buf.truncate(n);
        Ok(buf)
    }

    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, JsError> {
        let mut buf = vec![0u8; ciphertext.len()];
        let n = self.state.read_message(ciphertext, &mut buf).map_err(err)?;
        buf.truncate(n);
        Ok(buf)
    }

    /// Replaces this direction's sending key (Noise Rekey()).
    pub fn rekey_outgoing(&mut self) {
        self.state.rekey_outgoing();
    }

    pub fn rekey_incoming(&mut self) {
        self.state.rekey_incoming();
    }
}
