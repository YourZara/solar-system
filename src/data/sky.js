/* ================================================================== */
/* data/sky — constellations and bright stars.                         */
/*                                                                     */
/* Inert records only. Star positions are J2000 right ascension (hours)*/
/* and declination (degrees); `lines` indexes into `stars`. The scene   */
/* turns them into geometry — see scene/sky.js.                         */
/*                                                                     */
/* These were previously block-scoped inside the two anonymous blocks   */
/* that built the sky, which is why they were hard to reach.            */
/* ================================================================== */

export const CONSTELLATIONS = [
  { name: 'Orion', label: [5.6, 5], intro: 'The Hunter — marked by bright Betelgeuse and Rigel, with a belt of three stars in a row.',
    stars: [[5.9195, 7.407], [5.4189, 6.35], [5.5333, -0.299], [5.6036, -1.202], [5.6793, -1.943], [5.7959, -9.669], [5.2423, -8.202]],
    lines: [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [3, 6]] },
  { name: 'Ursa Major', label: [12.0, 58], intro: 'The Great Bear — home of the Big Dipper, a pointer to the North Star.',
    stars: [[11.0621, 61.751], [11.0307, 56.382], [11.8972, 53.695], [12.2571, 57.033], [12.9005, 55.96], [13.3988, 54.925], [13.7924, 49.313]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
  { name: 'Ursa Minor', label: [15.2, 78], intro: 'The Little Bear — its tail ends at Polaris, the North Star.',
    stars: [[2.5303, 89.264], [17.5369, 86.586], [16.2918, 75.755], [15.7343, 77.794], [15.3455, 71.834], [16.7661, 82.037], [14.8451, 74.156]],
    lines: [[0, 1], [1, 5], [5, 3], [3, 2], [2, 6], [6, 4], [4, 3]] },
  { name: 'Cassiopeia', label: [0.9, 62], intro: 'The Queen — a distinctive W (or M) of bright stars in the northern sky.',
    stars: [[0.6751, 56.537], [0.9451, 60.717], [1.4303, 60.235], [1.9102, 63.67], [0.153, 59.15]],
    lines: [[4, 0], [0, 1], [1, 2], [2, 3]] },
  { name: 'Scorpius', label: [16.9, -30], intro: 'The Scorpion — a hooked curve of stars with red Antares at its heart.',
    stars: [[16.4901, -26.432], [16.3531, -25.592], [16.0056, -22.622], [16.8361, -34.293], [17.5601, -37.104], [17.7081, -39.03], [17.7931, -37.043], [16.9098, -38.047]],
    lines: [[2, 1], [1, 0], [0, 3], [3, 7], [7, 4], [4, 5], [5, 6]] },
  { name: 'Leo', label: [10.5, 18], intro: 'The Lion — a sickle-shaped head and a triangle for its hindquarters.',
    stars: [[10.1395, 11.967], [10.3328, 19.842], [11.2351, 20.523], [11.8177, 14.572], [11.0621, 15.43], [10.1222, 23.417]],
    lines: [[0, 4], [4, 3], [3, 2], [2, 1], [1, 5], [5, 4]] },
  { name: 'Cygnus', label: [20.5, 42], intro: 'The Swan — a great cross flying along the Milky Way, also called the Northern Cross.',
    stars: [[20.6905, 45.28], [20.3705, 40.257], [19.7496, 45.131], [19.512, 27.965], [21.2267, 51.189]],
    lines: [[3, 0], [2, 0], [0, 1], [0, 4]] },
  { name: 'Lyra', label: [18.9, 36], intro: 'The Lyre — a small harp anchored by Vega, one of the brightest stars.',
    stars: [[18.6156, 38.784], [18.9824, 32.69], [18.908, 36.898], [18.7462, 33.363]],
    lines: [[0, 2], [2, 1], [1, 3], [3, 0]] },
  { name: 'Aquila', label: [19.8, 6], intro: 'The Eagle — with Altair at its center, soaring along the Milky Way.',
    stars: [[19.8464, 8.868], [19.425, 3.115], [19.771, 10.614]],
    lines: [[1, 0], [0, 2]] },
  { name: 'Taurus', label: [4.6, 18], intro: 'The Bull — marked by the V of the Hyades and the red star Aldebaran.',
    stars: [[4.5987, 16.509], [4.4769, 15.962], [4.3299, 15.627], [3.7914, 24.105], [5.4382, 28.608]],
    lines: [[0, 1], [1, 2], [2, 3], [0, 4]] },
  { name: 'Gemini', label: [7.4, 28], intro: 'The Twins — represented by the bright stars Castor and Pollux side by side.',
    stars: [[7.5767, 31.888], [7.7553, 28.026], [6.6285, 16.399], [6.7322, 25.131]],
    lines: [[2, 3], [3, 1], [1, 0]] },
  { name: 'Canis Major', label: [6.8, -22], intro: 'The Great Dog — home to Sirius, the brightest star in Earth’s night sky.',
    stars: [[6.7525, -16.716], [6.9771, -28.972], [7.0636, -26.393], [7.1399, -29.303], [6.3783, -17.956]],
    lines: [[4, 0], [0, 1], [1, 2], [2, 3]] },
  { name: 'Crux', label: [12.4, -60], intro: 'The Southern Cross — a small, brilliant cross guiding travelers in southern skies.',
    stars: [[12.4433, -63.099], [12.7954, -59.689], [12.5194, -57.113], [12.6267, -60.401]],
    lines: [[0, 2], [1, 3]] },
  { name: 'Sagittarius', label: [18.7, -28], intro: 'The Archer — its “teapot” shape points toward the dense center of the Milky Way.',
    stars: [[18.9211, -26.297], [19.0435, -29.88], [18.4662, -34.384], [18.3499, -29.828], [18.0965, -30.424], [18.4029, -36.761]],
    lines: [[3, 0], [0, 1], [0, 2], [2, 5], [3, 4], [4, 2]] },
];

export const BRIGHT_STARS = [
  { name: 'Sirius', ra: 6.7525, dec: -16.716, info: 'Brightest star in Earth’s night sky, in Canis Major.' },
  { name: 'Canopus', ra: 6.3992, dec: -52.696, info: 'A brilliant southern star, second only to Sirius.' },
  { name: 'Arcturus', ra: 14.2610, dec: 19.182, info: 'An orange giant in Boötes, among the brightest northern stars.' },
  { name: 'Vega', ra: 18.6156, dec: 38.784, info: 'A bright blue-white star in Lyra, near the summer sky.' },
  { name: 'Capella', ra: 5.2782, dec: 45.998, info: 'A golden pair of giants dominating Auriga.' },
  { name: 'Rigel', ra: 5.2423, dec: -8.202, info: 'Blue supergiant marking Orion’s foot.' },
  { name: 'Procyon', ra: 7.6550, dec: 5.225, info: 'The bright star of Canis Minor, near Orion.' },
  { name: 'Betelgeuse', ra: 5.9195, dec: 7.407, info: 'Red supergiant shoulder of Orion, vast and variable.' },
  { name: 'Altair', ra: 19.8464, dec: 8.868, info: 'Fast-spinning star at the heart of Aquila.' },
  { name: 'Aldebaran', ra: 4.5987, dec: 16.509, info: 'Fiery eye of Taurus, glowing orange-red.' },
  { name: 'Antares', ra: 16.4901, dec: -26.432, info: 'Rival of Mars — a red supergiant in Scorpius.' },
  { name: 'Spica', ra: 13.4199, dec: -11.161, info: 'Blue-white jewel of Virgo.' },
  { name: 'Pollux', ra: 7.7553, dec: 28.026, info: 'One of the twin stars of Gemini.' },
  { name: 'Fomalhaut', ra: 22.9608, dec: -29.622, info: 'A solitary bright star in the southern autumn sky.' },
  { name: 'Deneb', ra: 20.6905, dec: 45.280, info: 'Tail of Cygnus, a distant luminous supergiant.' },
  { name: 'Polaris', ra: 2.5303, dec: 89.264, info: 'The North Star — near the north celestial pole, anchor of Ursa Minor.' },
];
