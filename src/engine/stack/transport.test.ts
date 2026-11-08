import type { UdpData } from '../net/messages';
import { ip, ping, routedNetwork, simpleLan } from '../testing';
import { TCP_MAX_RETRIES, TCP_MSS, type CloseReason, type TcpSocket, type TcpState } from './tcp';

const text = (t: string): UdpData => ({ kind: 'text', text: t });

describe('UDP', () => {
  test('envoi, réception et réponse', () => {
    const { net, a, b } = simpleLan();
    net.start();
    const received: string[] = [];
    b.udp.bind(7, (data, info) => {
      if (data.kind === 'text') b.udp.send(7, info.src, info.srcPort, text(data.text.toUpperCase()));
    });
    const client = a.udp.bindEphemeral((data) => {
      if (data.kind === 'text') received.push(data.text);
    });
    expect(client.port).toBeGreaterThanOrEqual(49152);
    a.udp.send(client.port, ip('192.168.0.2'), 7, text('salut'));
    net.scheduler.runUntilIdle();
    expect(received).toEqual(['SALUT']);
    expect(b.udp.boundPorts).toEqual([7]);
    client.close();
    expect(a.udp.isBound(client.port)).toBe(false);
  });

  test('port fermé : ICMP port inaccessible', () => {
    const { net, a, b } = simpleLan();
    net.start();
    a.udp.send(5000, ip('192.168.0.2'), 9999, text('x'));
    net.scheduler.runUntilIdle();
    const last = b.capture.entries.at(-1)?.frame.payload;
    expect(last?.kind === 'ipv4' && last.payload.kind === 'icmp' && last.payload.code).toBe('port');
  });

  test('un port ne peut être lié deux fois', () => {
    const { a } = simpleLan();
    a.udp.bind(53, () => undefined);
    expect(() => a.udp.bind(53, () => undefined)).toThrow(/déjà utilisé/);
  });
});

function echoServer(socket: TcpSocket) {
  socket.on({
    data: (t) => {
      socket.send(`écho:${t}`);
    },
  });
}

describe('TCP', () => {
  test('connexion en trois temps, échange et fermeture propre', () => {
    const { net, a, b } = routedNetwork();
    net.start();
    let accepted: TcpSocket | null = null;
    b.tcp.listen(5000, (s) => {
      accepted = s;
      echoServer(s);
    });
    const log: string[] = [];
    const states: TcpState[] = [];
    const socket = a.tcp.connect(ip('192.168.2.10'), 5000, {
      open: () => {
        log.push('open');
        socket.send('bonjour');
      },
      data: (t) => {
        log.push(t);
        socket.close();
        states.push(socket.state);
      },
      close: (reason) => log.push(`close:${reason}`),
    });
    expect(socket.state).toBe('SYN_SENT');
    net.scheduler.runUntilIdle();
    expect(log).toEqual(['open', 'écho:bonjour', 'close:closed']);
    expect(states).toEqual(['FIN_WAIT_1']);
    expect(accepted).not.toBeNull();
    expect(a.tcp.connections).toHaveLength(0);
    expect(b.tcp.connections).toHaveLength(0);

    const flags = a.capture.entries
      .map((e) => e.frame.payload)
      .flatMap((p) => (p.kind === 'ipv4' && p.payload.kind === 'tcp' ? [p.payload] : []))
      .slice(0, 3)
      .map((s) => Object.keys(s.flags).sort().join('+'));
    expect(flags).toEqual(['syn', 'ack+syn', 'ack']);
  });

  test('les données envoyées avant l’établissement sont transmises après', () => {
    const { net, a, b } = simpleLan();
    net.start();
    const got: string[] = [];
    b.tcp.listen(80, (s) => s.on({ data: (t) => got.push(t) }));
    const socket = a.tcp.connect(ip('192.168.0.2'), 80);
    socket.send('premier');
    socket.close();
    net.scheduler.runUntilIdle();
    expect(got).toEqual(['premier']);
    expect(socket.state).toBe('CLOSED');
  });

  test('les longs messages sont découpés en segments', () => {
    const { net, a, b } = simpleLan();
    net.start();
    let received = '';
    b.tcp.listen(80, (s) => s.on({ data: (t) => (received += t) }));
    const big = 'x'.repeat(TCP_MSS * 2 + 10);
    const socket = a.tcp.connect(ip('192.168.0.2'), 80, {
      open: () => {
        socket.send(big);
      },
    });
    net.scheduler.runUntilIdle();
    expect(received).toBe(big);
    const dataSegments = b.capture.entries.filter(
      (e) =>
        e.direction === 'in' &&
        e.frame.payload.kind === 'ipv4' &&
        e.frame.payload.payload.kind === 'tcp' &&
        e.frame.payload.payload.data.length > 0,
    );
    expect(dataSegments).toHaveLength(3);
  });

  test('le serveur ferme en premier ; le client reçoit « end »', () => {
    const { net, a, b } = simpleLan();
    net.start();
    b.tcp.listen(80, (s) => {
      s.send('au revoir');
      s.close();
    });
    const log: string[] = [];
    a.tcp.connect(ip('192.168.0.2'), 80, {
      data: (t) => log.push(t),
      end: () => log.push('end'),
      close: (r) => log.push(r),
    });
    net.scheduler.runUntilIdle();
    expect(log).toEqual(['au revoir', 'end', 'closed']);
  });

  test('connexion refusée sans serveur', () => {
    const { net, a } = simpleLan();
    net.start();
    let reason: CloseReason | null = null;
    a.tcp.connect(ip('192.168.0.2'), 81, { close: (r) => (reason = r) });
    net.scheduler.runUntilIdle();
    expect(reason).toBe('refused');
  });

  test('pas de route', () => {
    const { net, a } = simpleLan();
    net.start();
    let reason: CloseReason | null = null;
    a.tcp.connect(ip('10.0.0.1'), 80, { close: (r) => (reason = r) });
    net.scheduler.runUntilIdle();
    expect(reason).toBe('no-route');
  });

  test('retransmission puis abandon quand le câble est coupé', () => {
    const { net, a, b } = simpleLan();
    net.start();
    b.tcp.listen(80, () => undefined);
    let reason: CloseReason | null = null;
    const socket = a.tcp.connect(ip('192.168.0.2'), 80, {
      open: () => {
        const cable = b.ports[0]?.cable;
        if (cable) net.disconnect(cable.id);
        socket.send('perdu');
      },
      close: (r) => (reason = r),
    });
    net.scheduler.runUntilIdle();
    expect(reason).toBe('timeout');
    const sent = a.capture.entries.filter(
      (e) =>
        e.frame.payload.kind === 'ipv4' &&
        e.frame.payload.payload.kind === 'tcp' &&
        e.frame.payload.payload.data === 'perdu',
    );
    expect(sent.length).toBe(1 + TCP_MAX_RETRIES);
  });

  test('abort envoie un RST', () => {
    const { net, a, b } = simpleLan();
    net.start();
    let serverReason: CloseReason | null = null;
    b.tcp.listen(80, (s) => s.on({ close: (r) => (serverReason = r) }));
    const socket = a.tcp.connect(ip('192.168.0.2'), 80, {
      open: () => {
        socket.abort();
      },
    });
    net.scheduler.runUntilIdle();
    expect(serverReason).toBe('reset');
  });

  test('un port d’écoute est exclusif et peut être libéré', () => {
    const { a } = simpleLan();
    const stop = a.tcp.listen(80, () => undefined);
    expect(() => a.tcp.listen(80, () => undefined)).toThrow();
    expect(a.tcp.listeningPorts).toEqual([80]);
    stop();
    expect(a.tcp.listeningPorts).toEqual([]);
  });
});

describe('Pare-feu', () => {
  test('pare-feu d’un poste : bloque les pings entrants mais pas les réponses', () => {
    const { net, a, b } = simpleLan();
    b.firewall.enabled = true;
    net.start();
    expect(ping(net, a, '192.168.0.2').kind).toBe('timeout');
    expect(ping(net, b, '192.168.0.1').kind).toBe('reply');
    expect(b.firewall.droppedCount).toBe(1);
  });

  test('règle d’autorisation par protocole et port', () => {
    const { net, a, b } = simpleLan();
    b.firewall.enabled = true;
    b.firewall.rules = [
      {
        action: 'accept',
        protocol: 'tcp',
        source: 0,
        sourceMask: 0,
        destination: 0,
        destinationMask: 0,
        port: 80,
      },
    ];
    net.start();
    b.tcp.listen(80, (s) => {
      s.send('ok');
    });
    b.tcp.listen(22, (s) => {
      s.send('ok');
    });
    const outcomes: string[] = [];
    a.tcp.connect(ip('192.168.0.2'), 80, { data: (t) => outcomes.push(`80:${t}`) });
    a.tcp.connect(ip('192.168.0.2'), 22, { close: (r) => outcomes.push(`22:${r}`) });
    net.scheduler.runUntilIdle();
    expect(outcomes).toEqual(['80:ok', '22:timeout']);
  });

  test('règle de refus prioritaire selon l’ordre', () => {
    const { net, a, b } = simpleLan();
    const any = { source: 0, sourceMask: 0, destination: 0, destinationMask: 0, port: 0 };
    b.firewall.enabled = true;
    b.firewall.rules = [
      {
        ...any,
        action: 'drop',
        protocol: 'icmp',
        source: ip('192.168.0.1'),
        sourceMask: ip('255.255.255.255'),
      },
      { ...any, action: 'accept', protocol: 'any' },
    ];
    net.start();
    expect(ping(net, a, '192.168.0.2').kind).toBe('timeout');
    b.firewall.rules = [{ ...any, action: 'accept', protocol: 'icmp', port: 7 }];
    expect(ping(net, a, '192.168.0.2').kind).toBe('timeout');
  });

  test('pare-feu du routeur : filtre le trafic traversant', () => {
    const { net, a, b, r } = routedNetwork();
    r.firewall.enabled = true;
    r.firewall.rules = [
      {
        action: 'accept',
        protocol: 'icmp',
        source: ip('192.168.1.0'),
        sourceMask: ip('255.255.255.0'),
        destination: 0,
        destinationMask: 0,
        port: 0,
      },
    ];
    net.start();
    expect(ping(net, a, '192.168.2.10').kind).toBe('reply');
    expect(ping(net, b, '192.168.1.10').kind).toBe('timeout');
    expect(ping(net, b, '192.168.2.1').kind).toBe('reply'); // the router itself stays reachable
  });
});
