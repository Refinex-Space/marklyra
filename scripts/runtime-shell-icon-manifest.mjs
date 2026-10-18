// Identity and observed family metadata only; original font bytes stay in private inputs.
export const SHELL_ICON_MANIFEST = Object.freeze([
  {
    path: 'typora-icon/fonts/typora-icon.woff',
    family: 'MarkLyra Icons',
    originalFamily: 'typora-icon',
    bytes: 15516,
    sha256: '49a95eea5e45c2dfbb2483cfc64b7f6b5b3f4d5d863dc8d39ad2ea1c00fe659d',
    license: 'private-unreviewed',
  },
  {
    path: 'ionicons-2.0.1/fonts/ionicons.woff',
    family: 'MarkLyra Ionicons',
    originalFamily: 'Ionicons',
    bytes: 57276,
    sha256: 'c5fd4000901f835054a4e6ed4bf0ddd5800ba2a3aebe5e5e4fc3147497c14636',
    license: 'MIT',
  },
  {
    path: 'font-awesome-4.1.0/fonts/fontawesome-webfont.woff',
    family: 'MarkLyra FontAwesome',
    originalFamily: 'FontAwesome',
    bytes: 83760,
    sha256: '66db52b456efe7e29cec11fa09421d03cb09e37ed1b567307ec0444fd605ce31',
    license: 'OFL-1.1',
  },
]);

// Exact symbols from the private runtime page; SVG artwork stays out of Git.
export const SEARCH_ICON_MANIFEST = Object.freeze([
  { name: 'case', sha256: 'cf6b7be022b4dda02e4f7111b3fda18ea46366377d0f8c2ff4141f81e7582687' },
  { name: 'word', sha256: 'b345eb86697e3a2cf5510a60288df53ee3751126bdb32c8fc34321227be77a62' },
  { name: 'regexp', sha256: 'c3315e5d9ff9044134f2414c1b9714db694b0d96886f31c8b719e069f4cf444c' },
]);
