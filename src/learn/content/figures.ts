/* Figures drawn by RéseauLab that a knowledge card can show: a paragraph
 * made only of `[[schema:couches]]` becomes the figure. The title is its
 * caption; the description is read by a screen reader instead of the picture. */

export interface FigureInfo {
  readonly title: string;
  readonly description: string;
}

export const FIGURES = {
  couches: {
    title: 'Un message emballé couche par couche',
    description:
      'Quatre rectangles emboîtés : la couche Liaison (adresses MAC) contient la couche Réseau (adresses IP), qui contient la couche Transport (numéro de port), qui contient la couche Application (les données).',
  },
  'adresse-ip': {
    title: 'Les deux parties d’une adresse IP',
    description:
      'L’adresse 192.168.1.10 avec le masque 255.255.255.0 : les trois premiers nombres, 192.168.1, désignent le réseau ; le dernier, 10, désigne l’équipement.',
  },
  'meme-reseau': {
    title: 'Même réseau ou non ? (masque 255.255.255.0)',
    description:
      '192.168.1.10 et 192.168.1.25 ont la même partie réseau, 192.168.1 : même réseau. 192.168.1.10 et 192.168.2.10 diffèrent sur le troisième nombre : deux réseaux différents.',
  },
  passerelle: {
    title: 'La passerelle : le routeur, vu depuis le réseau du poste',
    description:
      'Un poste 192.168.1.10 est relié par un switch à un routeur. Le routeur a l’adresse 192.168.1.1 du côté du poste, et 10.0.0.1 de l’autre côté, où se trouve un serveur 10.0.0.80. La passerelle du poste est 192.168.1.1.',
  },
  arp: {
    title: 'ARP : trouver l’adresse MAC qui va avec une adresse IP',
    description:
      'Étape 1 : le poste A demande à tous les équipements du réseau qui a l’adresse 192.168.1.20. Étape 2 : seul le poste B, qui a cette adresse, répond avec son adresse MAC. Le poste C ignore la demande.',
  },
  dns: {
    title: 'Le DNS, puis le serveur web',
    description:
      'Étape 1 : le poste demande au serveur DNS l’adresse de www.college.fr. Étape 2 : le serveur DNS répond 10.0.0.80. Étape 3 : le poste demande la page au serveur web 10.0.0.80.',
  },
  topologies: {
    title: 'Trois façons de relier les équipements',
    description:
      'En étoile : quatre ordinateurs, chacun relié par son câble à un switch placé au centre. En arbre : un switch principal relié à deux switchs, chacun relié à deux ordinateurs. Maillée : quatre routeurs reliés par plusieurs liaisons, si bien qu’il existe plusieurs chemins de l’un à l’autre.',
  },
  'chemin-internet': {
    title: 'D’un routeur à l’autre jusqu’au serveur',
    description:
      'Le message part du poste, passe par la box, puis par deux routeurs, avant d’arriver au serveur web. Chaque routeur traversé est un saut ; traceroute les affiche un par un.',
  },
} as const satisfies Record<string, FigureInfo>;

export type FigureId = keyof typeof FIGURES;

export function figureInfo(id: string): FigureInfo | undefined {
  return Object.hasOwn(FIGURES, id) ? FIGURES[id as FigureId] : undefined;
}
