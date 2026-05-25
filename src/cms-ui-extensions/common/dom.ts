export function createCard(title: string): HTMLDivElement {
  const card = document.createElement('div');
  card.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
  card.style.border = '1px solid #d4d4d8';
  card.style.borderRadius = '10px';
  card.style.padding = '12px';
  card.style.background = '#ffffff';
  card.style.color = '#111827';
  card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';

  const heading = document.createElement('div');
  heading.style.fontSize = '14px';
  heading.style.fontWeight = '700';
  heading.style.marginBottom = '10px';
  heading.textContent = title;
  card.appendChild(heading);

  return card;
}

export function createMutedText(value: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.fontSize = '12px';
  el.style.color = '#52525b';
  el.textContent = value;
  return el;
}

export function createLabelValueRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.gap = '16px';
  row.style.margin = '6px 0';

  const left = document.createElement('span');
  left.style.fontSize = '12px';
  left.style.color = '#52525b';
  left.textContent = label;

  const right = document.createElement('span');
  right.style.fontSize = '12px';
  right.style.fontWeight = '600';
  right.style.color = '#18181b';
  right.textContent = value;

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

export function createButton(label: string, tone: 'primary' | 'neutral' = 'neutral'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.fontSize = '12px';
  button.style.fontWeight = '600';
  button.style.padding = '7px 10px';
  button.style.borderRadius = '8px';
  button.style.cursor = 'pointer';
  button.style.border = tone === 'primary' ? '1px solid #2563eb' : '1px solid #d4d4d8';
  button.style.background = tone === 'primary' ? '#2563eb' : '#f4f4f5';
  button.style.color = tone === 'primary' ? '#ffffff' : '#111827';

  button.onmouseenter = () => {
    button.style.filter = 'brightness(0.96)';
  };
  button.onmouseleave = () => {
    button.style.filter = 'none';
  };

  return button;
}
