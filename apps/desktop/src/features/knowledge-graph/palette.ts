export interface GraphPalette {
  background: string;
  text: string;
  node: string;
  edge: string;
  focus: string;
  missing: string;
  faded: string;
}
export const lightPalette: GraphPalette = {
  background: '#ffffff',
  text: '#373737',
  node: '#64748b',
  edge: '#7e8997',
  focus: '#3974ab',
  missing: '#a36a14',
  faded: '#c4cad2',
};
export const darkPalette: GraphPalette = {
  background: '#0d1117',
  text: '#e3e5e7',
  node: '#a7b4c5',
  edge: '#5e6a79',
  focus: '#91bced',
  missing: '#d7ac63',
  faded: '#424b57',
};
