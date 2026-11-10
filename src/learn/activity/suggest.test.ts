import { IP_ANY } from '../../engine/core/ipv4';
import { Network } from '../../engine/network';
import { routedNetwork, simpleLan } from '../../engine/testing';
import { exampleNetwork } from '../../project/example';
import { serializeProject } from '../../project/serialize';
import { evaluateAll, gateSteps } from './evaluate';
import { EMPTY_WORK, activitySchema, familyOf, objectivesOf, type Activity, type Check } from './schema';
import { START_LABEL, referByName, startingNetwork, suggestObjectives, type Suggestion } from './suggest';

/** An activity made of every suggestion. */
function activityOf(
  suggestions: readonly Suggestion[],
  convert: (check: Check) => Check = (c) => c,
): Activity {
  return activitySchema.parse({
    id: 'proposee',
    title: 'Proposée',
    level: '3e',
    // Une étape contient vingt objectifs au plus : les propositions sont réparties.
    steps: Array.from({ length: Math.max(1, Math.ceil(suggestions.length / 15)) }, (_, step) => ({
      id: `etape-${step}`,
      title: `Étape ${step + 1}`,
      objectives: suggestions.slice(step * 15, step * 15 + 15).map((s, i) => ({
        id: `o${step * 15 + i}`,
        label: s.label,
        check: convert(s.check),
      })),
    })),
  });
}

describe('Objectifs proposés à l’enseignant', () => {
  test('tout ce qui est proposé est atteint par le réseau solution', () => {
    for (const network of [simpleLan().net, routedNetwork().net, exampleNetwork()]) {
      const before = serializeProject(network);
      const suggestions = suggestObjectives(network);
      expect(suggestions.length).toBeGreaterThan(5);
      const activity = activityOf(suggestions);
      const outcomes = evaluateAll(activity, network, EMPTY_WORK);
      const missed = objectivesOf(activity)
        .filter((o) => familyOf(o.check) !== 'journal' && outcomes.get(o.id)?.status !== 'done')
        .map((o) => o.label);
      expect(missed).toEqual([]);
      // Proposer ne modifie pas le réseau de l'enseignant.
      expect(serializeProject(network)).toBe(before);
    }
  });

  test('du plus simple au plus parlant, avec des phrases pour l’élève', () => {
    const { net } = routedNetwork();
    const labels = suggestObjectives(net).map((s) => s.label);
    expect(labels).toEqual([
      'Le plan contient 2 ordinateurs',
      'Le plan contient 1 routeur',
      'Le plan contient 2 switchs',
      'A est relié à Switch 1',
      'R est relié à Switch 1',
      'R est relié à Switch 2',
      'B est relié à Switch 2',
      'A a une adresse du réseau 192.168.1.0',
      'A a une passerelle',
      'B a une adresse du réseau 192.168.2.0',
      'B a une passerelle',
      'R a une interface dans le réseau 192.168.1.0',
      'R a une interface dans le réseau 192.168.2.0',
      'Le bouton Vérifier ne signale plus rien',
      'A communique avec B',
      'B communique avec A',
      'La commande ping a été utilisée sur A',
      'La simulation a été lancée',
    ]);
  });

  test('services, DNS, web et DHCP du réseau d’exemple', () => {
    const labels = suggestObjectives(exampleNetwork()).map((s) => s.label);
    expect(labels).toContain('Poste 1 est en configuration automatique (DHCP)');
    expect(labels).toContain('Le logiciel « Serveur web » est démarré sur Serveur web');
    expect(labels).toContain('Serveur DNS connaît son serveur DNS');
    expect(labels.some((l) => l.includes('obtient l’adresse de www.college.fr'))).toBe(true);
    expect(labels.some((l) => l.includes('affiche la page web de Serveur web'))).toBe(true);
    expect(labels.filter((l) => l.includes(' communique avec ')).length).toBeLessThanOrEqual(6);
  });

  test('un réseau qui ne fonctionne pas ne propose pas de communication ; un plan vide ne propose rien', () => {
    const { net, a } = routedNetwork();
    a.updateConfig({ gateway: IP_ANY });
    const labels = suggestObjectives(net).map((s) => s.label);
    expect(labels).not.toContain('A communique avec B');
    expect(labels).not.toContain('Le bouton Vérifier ne signale plus rien');
    expect(suggestObjectives(new Network())).toEqual([]);
  });
});

describe('Réseau de départ d’une activité', () => {
  test('tel quel, sans les adresses, ou vide — sans toucher au réseau de l’enseignant', () => {
    const { net, a, r } = routedNetwork();
    const before = serializeProject(net);
    expect(serializeProject(startingNetwork(net, 'as-is'))).toBe(before);

    const bare = startingNetwork(net, 'no-addresses');
    expect(bare.devices.map((d) => d.id)).toEqual(net.devices.map((d) => d.id));
    expect(bare.cables).toHaveLength(net.cables.length);
    expect(bare.host(a.id).config).toMatchObject({ ip: IP_ANY, mask: IP_ANY, gateway: IP_ANY });
    expect(bare.router(r.id).interfaces.map((i) => i.ip)).toEqual([IP_ANY, IP_ANY]);

    const empty = startingNetwork(net, 'empty');
    expect(empty.devices).toHaveLength(0);
    expect(empty.cables).toHaveLength(0);
    expect(serializeProject(net)).toBe(before);
    expect(Object.keys(START_LABEL).sort()).toEqual(['as-is', 'empty', 'no-addresses']);
  });

  test('les postes en DHCP gardent leur réglage quand on retire les adresses', () => {
    const example = exampleNetwork();
    const bare = startingNetwork(example, 'no-addresses');
    const poste = bare.devices.find((d) => d.name === 'Poste 1');
    expect(poste && bare.host(poste.id).config.useDhcp).toBe(true);
  });

  test('rien n’est atteint au départ sans adresses, tout l’est avec la solution', () => {
    const { net } = routedNetwork();
    const activity = activityOf(suggestObjectives(net).filter((s) => familyOf(s.check) !== 'journal'));
    const done = (network: Network) =>
      [...gateSteps(activity, evaluateAll(activity, network, EMPTY_WORK)).values()].filter(
        (o) => o.status === 'done',
      ).length;
    const total = objectivesOf(activity).length;
    expect(done(net)).toBe(total);
    // Sans adresses : seuls les équipements et les câbles sont déjà là.
    expect(done(startingNetwork(net, 'no-addresses'))).toBe(7);
  });

  test('sur un plan vide, les équipements sont désignés par leur nom', () => {
    const { net } = simpleLan();
    const suggestions = suggestObjectives(net);
    const ping = suggestions.find((s) => s.check.type === 'ping')?.check;
    expect(ping && referByName(ping)).toEqual({
      type: 'ping',
      from: { by: 'name', name: 'A' },
      to: { by: 'name', name: 'B' },
      expect: 'reply',
    });
    expect(referByName({ type: 'lintClean', ignore: [] })).toEqual({ type: 'lintClean', ignore: [] });
    // L'élève qui reconstruit le réseau en nommant ses équipements valide les mêmes objectifs.
    const byName = activityOf(suggestions, referByName);
    const outcomes = evaluateAll(byName, net, EMPTY_WORK);
    const missed = byName.steps[0]?.objectives
      .filter((o) => familyOf(o.check) !== 'journal' && outcomes.get(o.id)?.status !== 'done')
      .map((o) => o.label);
    expect(missed).toEqual([]);
    const start = evaluateAll(byName, startingNetwork(net, 'empty'), EMPTY_WORK);
    expect([...start.values()].some((o) => o.status === 'done')).toBe(false);
  });
});
