/* Elements of the RéseauLab screen that a knowledge card can show to the
 * pupil: `[[ecran:simulation]]` in its text draws the element and makes it
 * blink on the screen. The interface marks each one with `data-ui="<id>"`. */

export interface ScreenElement {
  /** How the element is named in a text: its label on the screen. */
  readonly label: string;
  /** Where to find it, said when it is not on the screen at that moment. */
  readonly where: string;
}

export const SCREEN_ELEMENTS = {
  conception: { label: 'Conception', where: 'en haut de l’écran, au milieu' },
  simulation: { label: 'Simulation', where: 'en haut de l’écran, au milieu' },
  palette: { label: 'palette', where: 'à gauche de l’écran, en mode Conception' },
  cable: { label: 'Câble', where: 'dans la palette, à gauche, en mode Conception' },
  texte: { label: 'Texte', where: 'dans la palette, à gauche, en mode Conception (selon le niveau)' },
  zone: { label: 'Zone', where: 'dans la palette, à gauche, en mode Conception (selon le niveau)' },
  panneau: { label: 'panneau du bas', where: 'en bas de l’écran' },
  annuler: { label: 'Annuler', where: 'en haut de l’écran, en mode Conception' },
  verifier: { label: 'Vérifier', where: 'en haut à droite de l’écran' },
  aide: { label: 'Aide', where: 'en haut à droite de l’écran' },
  reglages: { label: 'Réglages', where: 'en haut à droite de l’écran (⚙)' },
  enregistrer: { label: 'Enregistrer', where: 'en haut à gauche de l’écran' },
  ouvrir: { label: 'Ouvrir…', where: 'en haut à gauche de l’écran, en mode Conception' },
  exemple: { label: 'Exemple', where: 'en haut de l’écran, en mode Conception' },
  activites: { label: 'Activités', where: 'en haut de l’écran, en mode Conception' },
  'compte-rendu': { label: 'Compte rendu', where: 'en haut à gauche de l’écran' },
  zoom: { label: 'zoom', where: 'en bas à droite du plan' },
  legende: { label: 'Légende des trames', where: 'en bas à gauche du plan, en mode Simulation' },
  vitesse: { label: 'Vitesse', where: 'en haut de l’écran, en mode Simulation' },
  pause: { label: 'Pause', where: 'en haut de l’écran, en mode Simulation' },
  'trame-suivante': { label: 'Trame suivante', where: 'en haut de l’écran, en mode Simulation' },
  ranger: { label: 'Ranger les fenêtres', where: 'dans le panneau du bas, quand des fenêtres sont ouvertes' },
} as const satisfies Record<string, ScreenElement>;

export type ScreenId = keyof typeof SCREEN_ELEMENTS;

export function screenElement(id: string): ScreenElement | undefined {
  return Object.hasOwn(SCREEN_ELEMENTS, id) ? SCREEN_ELEMENTS[id as ScreenId] : undefined;
}
