// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { SafeHtml, extractTitle, imageSources } from './SafeHtml';

const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';

function show(html: string, resolveImage: (src: string) => string | null = () => null) {
  const navigate = vi.fn<(href: string) => void>();
  const { container } = render(<SafeHtml html={html} onNavigate={navigate} resolveImage={resolveImage} />);
  return { container, navigate };
}

describe('SafeHtml', () => {
  test('garde le contenu autorisé', () => {
    show('<h1>Titre</h1><p>Un <b>texte</b></p><table border="1"><tr><td colspan="2">c</td></tr></table>');
    expect(screen.getByRole('heading', { name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('texte').tagName).toBe('B');
    expect(screen.getByText('c')).toHaveAttribute('colspan', '2');
  });

  test('supprime scripts, styles, gestionnaires et iframes', () => {
    const { container } = show(
      '<p onclick="alert(1)" style="color:red">ok</p><script>alert(1)</script><style>p{}</style><iframe src="http://x"></iframe><marquee>texte</marquee>',
    );
    expect(container.querySelector('script, style, iframe, marquee')).toBeNull();
    expect(container.querySelector('[onclick], [style]')).toBeNull();
    expect(container.textContent).toBe('oktexte');
  });

  test('liens interceptés ; liens dangereux ignorés', () => {
    const { navigate } = show('<a href="page.html">suivant</a><a href="javascript:alert(1)">piège</a>');
    const link = screen.getByText('suivant');
    expect(link).toHaveAttribute('href', '#');
    fireEvent.click(link);
    fireEvent.click(screen.getByText('piège'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('page.html');
  });

  test('images : seulement les sources résolues', () => {
    show('<img src="a.png" alt="logo" width="20" height="9999">', () => null);
    expect(screen.getByText('[image : logo]')).toBeInTheDocument();
    const { container } = show('<img src="a.png" alt="logo" width="20" height="9999">', () => PIXEL);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', PIXEL);
    expect(img).toHaveAttribute('width', '20');
    expect(img).not.toHaveAttribute('height');
  });

  test('titre et sources d’images', () => {
    expect(extractTitle('<html><head><title> Accueil </title></head></html>')).toBe('Accueil');
    expect(imageSources('<img src="a.png"><img><img src="b.gif">')).toEqual(['a.png', 'b.gif']);
  });
});
