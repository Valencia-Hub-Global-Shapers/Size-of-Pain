// layers.js - names and general explanations for every kind of feature a
// camp dataset can contain. Camp-specific text lives in data/camps.json
// under each camp's "layers" key and is shown alongside these.

export const LAYER_ORDER = [
  'boundary', 'sector', 'fence', 'barracks', 'watchtower',
  'crematoria', 'railway', 'memorial', 'other',
];

export const LAYER_INFO = {
  boundary: {
    label: 'Camp boundary',
    general: 'The outer limit of the site as it is mapped today. All the area, perimeter and walking-time figures are measured from this outline. Prisoners were confined inside it, usually behind electrified barbed wire, a ditch or a wall.',
  },
  sector: {
    label: 'Sub-camp sectors',
    general: 'Inner fences that split the camp into separately guarded sections. The SS used them to segregate prisoners by sex, origin or purpose and to control movement between parts of the camp.',
  },
  fence: {
    label: 'Fences and walls',
    general: 'Surviving or traced lines of fencing and walls. Most camp fences were double rows of barbed wire, often electrified, overlooked by watchtowers.',
  },
  barracks: {
    label: 'Barracks and blocks',
    general: 'The buildings, or their foundations, where prisoners were forced to live. Many were designed for a fraction of the people eventually crammed into them, with little heating, sanitation or space.',
  },
  watchtower: {
    label: 'Watchtowers',
    general: 'Guard posts along the perimeter, from which SS guards could shoot anyone approaching the fence.',
  },
  crematoria: {
    label: 'Gas chambers and crematoria',
    general: 'Places of mass murder and the destruction of bodies. Most were blown up or dismantled by the SS to hide the crimes, so what you see are mainly ruins or reconstructed outlines.',
  },
  railway: {
    label: 'Railway and arrival area',
    general: 'Tracks and sidings that brought deportation trains to the camp. Arrival was often the moment families were torn apart and people were selected for forced labour or immediate death.',
  },
  memorial: {
    label: 'Memorials',
    general: 'Monuments, mass-grave markers and symbolic installations created after the war to commemorate the victims. They are not part of the original camp.',
  },
  other: {
    label: 'Other structures',
    general: 'Other documented buildings and ruins: administration, kitchens, washrooms, storage, workshops, guardhouses and SS facilities that kept the camp running.',
  },
};
