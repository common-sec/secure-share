// Common, easy-to-picture English words. The passphrase generator uses them as-is and as raw
// material for modified words, blends and invented words. Duplicates are removed at load time.
export const WORDS = [...new Set(`
acorn actor admiral adult advice airport album alarm alley almond alpha amber anchor angel ankle
answer anvil apple apricot april apron arch arena arrow artist ash atlas attic august aunt autumn
avocado award baby bacon badge badger bagel baker balcony ball ballet balloon bamboo banana band
banjo bank barber barn barrel basket bat bath battery beach beacon bean bear beard beaver bed bee
beetle bell belt bench berry bicycle bird biscuit bishop blanket blender blizzard block blossom
blue board boat bone bonnet book boot bottle boulder bowl box bracelet brain branch brave bread
breeze brick bridge brother brush bubble bucket buffalo bugle bulb bunny butter button cabbage
cabin cable cactus cake camel camera camp canal candle candy cannon canoe canvas canyon cape
captain car caramel card carpet carrot castle cat cave cedar celery cello cement chair chalk
champion cheese cherry chess chicken chimney chin circus citrus city clam clay cliff clock cloud
clover clown coach coal coast coat cobra cocoa coconut coffee coin comet compass cookie copper
coral corn cotton couch cougar cowboy crab crane crayon cricket crow crown crystal cube cup
cupcake curtain cushion daisy dancer dawn deer denim desert desk diamond dinner dinosaur doctor
dog doll dolphin donkey door dove dragon drawer dream dress drum duck dune eagle earth echo eel
egg elbow elephant elk ember emerald engine eraser falcon fan farm feather fence ferret ferry
fiddle field fig finger fire fish flag flame flamingo flute foam fog forest fork fossil fountain
fox frog frost fruit galaxy garage garden garlic gate gecko gem ghost giant gift ginger giraffe
glacier glass globe glove goat goblin gold goose gorilla grape grass gravel guitar gull hammer
hamster harbor harp hat hawk hazel heart hedge helmet hen hero heron hill hippo honey hook horse
hotel house husky ice igloo island ivory jacket jaguar jam jar jasmine jelly jester jet jewel
jigsaw judge juice jungle kangaroo kayak kettle key king kite kitten kiwi knight koala ladder
lake lamb lamp lantern laser lava leaf legend lemon lemur leopard letter lettuce library light
lily lime lion lizard llama lobster lock locket lotus lunar magnet mango mantis map maple marble
market meadow medal melon mermaid metal meteor milk mill mint mirror mitten mole monkey moon
moose mosaic moth mountain mouse muffin mug mule mushroom music mustard nail napkin nebula
necklace nectar needle nest net newt night ninja noodle north nugget nut oak oasis ocean octopus
office olive onion opal orange orbit orchid ostrich otter owl oyster paddle page paint palace
palm panda panther paper parade park parrot party peach peacock peanut pear pearl pebble pelican
pen pencil penguin pepper piano pickle picnic pie pig pigeon pillow pilot pine pirate pizza
planet plum pocket poem polar pond pony popcorn potato pottery puffin pumpkin puppet puzzle
pyramid queen quilt rabbit raccoon radar radio radish rain rainbow raisin ranch raven razor
reef rhino ribbon rice riddle ring river road robin robot rocket rodeo roof rooster rope rose
ruby saddle safari sail salad salmon salt sand sandal satin sauce saucer scarf school scooter
seal season seed shadow shark sheep shell shield ship shoe shovel silver singer skate sky sled
sloth snail snake snow soap sock sofa soup sparrow spider spinach spiral spoon squid squirrel
stable stamp star statue stone storm stove straw stream street sugar summer sun sunset swan
sweater sword table tablet taco tadpole tango teapot temple tennis tent thunder ticket tiger
timber toast toffee tomato tooth torch tortoise towel tower tractor train tree triangle trophy
trumpet tulip tuna tunnel turkey turnip turtle twig umbrella unicorn valley vanilla vase velvet
violet violin viper volcano wafer waffle wagon walnut walrus wand wasp watch water wave whale
wheat wheel whistle window winter wizard wolf wombat wool yacht yarn yellow yogurt zebra zephyr
zigzag acrobat almanac alpaca amulet antler aqua arcade armor aspen bakery bandit banner barley
basil bazaar beagle beret bistro blossom bluebird bobcat bonfire bramble brook bubble buckle
bulldog burrito cabaret cactus cadet calico camper candle cargo carousel cashew cedar chalet
chapel cheetah chestnut chili cinnamon clarinet cobble comet condor cookie corridor cosmos
cottage coyote cradle crater cricket crocus cupid cyclone dahlia dagger dingo domino dragonfly
drizzle dumpling dynamo easel eclipse elf espresso fable falafel fern fiesta firefly fjord
flannel fleece fudge funnel gadget gazelle geyser glider gnome gondola gopher granite gravy
grizzly guava gumball hammock harvest hazelnut hermit hickory hiking hockey hornet hula iceberg
icicle iguana inkwell jackal jade javelin jellybean jockey journal juniper kernel kimono kingdom
kipper ladle lagoon lasso latte lavender lilac limerick linen lobby locust lollipop lullaby lynx
macaw magpie mammoth marigold marmot marsh mascot meerkat melody meringue minnow mocha monsoon
mosquito muffler nacho narwhal nectarine nimbus noodle nutmeg oatmeal obelisk ocelot omelet
orbit origami osprey outpost paddock pagoda paprika parsley pasta pastry pebble pepper petal
pewter pheasant pistachio pixel plasma platypus polka pompom porcupine postcard pretzel prism
pudding puma quail quartz quiver radish raft rattle ravioli redwood reindeer relic ripple
rocket rosemary rowboat saffron sage salsa sapphire sardine satchel scallop scarecrow sequoia
sherbet shrimp skipper sleigh slipper smoothie snorkel sombrero sonar spaniel sparkle sphinx
sprout spruce stallion starfish stingray stork strudel sundae sunflower surfer sushi swallow
syrup taffy talon tambourine tapestry tavern teacup terrier thimble thistle thrush tinsel toucan
toybox trapeze treasure trellis trolley truffle tugboat tundra turban tuxedo twister ukulele
urchin vapor velcro vortex waffle walrus warbler wasabi weasel whisker willow windmill wren
yodel yeti zinnia zucchini
`.trim().split(/\s+/).filter((w) => /^[a-z]{3,10}$/.test(w)))];

export const WORD_SET = new Set(WORDS);
