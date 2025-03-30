const skinColorMap = {
  white: "f5e6da",
  asian: "d1a67c",
  black: "5b3a29",
  hispanic: "a47448",
  arab: "c89f7c",
  south_asian: "8c6239",
  native_american: "b57c53",
};

const mouthCollection = [
  "smile",
  "frown",
  "laughing",
  "nervous",
  "pucker",
  "sad",
  "smile",
  "smirk",
  "surprised",
];

const hairCollection = [
  "dannyPhantom",
  "dougFunny",
  "fonze",
  "full",
  "mrClean",
  "mrT",
  "pixie",
  "turban",
];

const eyesCollection = ["eyes", "round", "smiling"];

const shirtCollection = ["open", "crew", "collared"];

const earringsCollection = ["stud", "hoop"];

const noseCollection = ["curve", "pointed", "round"];

const earsCollection = ["attached", "detached"];

const facialHairCollection = ["scuff", "beard"];

const eyeBrowsCollection = ["down", "eyelashesDown", "eyelashesUp", "up"];

const pickRandomValue = (array: string[]) => {
  const maxValue = array.length;
  const randomValue = Math.random() * maxValue;
  return array[Math.floor(randomValue)];
};

export default function generateAvatarParams(ethnicity: string) {
  return {
    baseColor: skinColorMap[ethnicity] ? [skinColorMap[ethnicity]] : ["f5e6da"],
    mouth: [pickRandomValue(mouthCollection)],
    nose: [pickRandomValue(noseCollection)],
    ears: [pickRandomValue(earsCollection)],
    hair: [pickRandomValue(hairCollection)],
    hairColor: [pickRandomValue(Object.values(skinColorMap))],
    eyes: [pickRandomValue(eyesCollection)],
    eyebrows: [pickRandomValue(eyeBrowsCollection)],
    shirt: [pickRandomValue(shirtCollection)],
    earrings: [pickRandomValue(earringsCollection)],
    facialHair: [pickRandomValue(facialHairCollection)],
    backgroundColor: ["dc2d3c", "fc8c0c"],
    backgroundType: ["gradientLinear"],
  };
}
