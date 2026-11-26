const { SIZE } = require('../../lib/wheel');
const SECTOR = 2 * Math.PI / SIZE;
const COLORS = ['#E2E9D7', '#FBF0D4', '#E9EEDD', '#F8EDCF', '#DEE8D7', '#FCF3DC'];

function labelLines(context, name, width) {
  const characters = Array.from(name);
  const lines = [''];
  while (characters.length) {
    const character = characters.shift();
    const last = lines.length - 1;
    if (context.measureText(lines[last] + character).width <= width) {
      lines[last] += character;
    } else if (lines.length === 1) {
      lines.push(character);
    } else {
      const tail = Array.from(lines[last]);
      while (tail.length && context.measureText(tail.join('') + '…').width > width) tail.pop();
      lines[last] = tail.join('') + '…';
      break;
    }
  }
  return lines;
}

function createWheelRenderer(canvas, size, pixelRatio, items) {
  if (items.length !== SIZE || !size) return;
  canvas.width = Math.round(size * pixelRatio);
  canvas.height = Math.round(size * pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(pixelRatio, pixelRatio);
  const center = size / 2;
  const radius = center - 9;
  const labelSize = Math.max(11, Math.min(17, radius * 0.103));
  const lineHeight = labelSize * 1.26;
  context.font = `600 ${labelSize}px sans-serif`;
  const labels = items.map(({ name }, index) => {
    const angle = -Math.PI / 2 + index * SECTOR;
    const side = Math.abs(Math.cos(angle)) > 0.5;
    const distance = radius * (side ? 0.64 : 0.63);
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    return { x, y, lines: labelLines(context, name, radius * (side ? 0.57 : 0.66)) };
  });

  return (rotation) => {
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);
    context.rotate(rotation * Math.PI / 180);
    context.translate(-center, -center);
    COLORS.forEach((color, index) => {
      const angle = -Math.PI / 2 + index * SECTOR;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, angle - SECTOR / 2, angle + SECTOR / 2);
      context.closePath();
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = '#FBFCF7';
      context.lineWidth = 2;
      context.stroke();
    });

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#243120';
    for (const { x, y, lines } of labels) {
      lines.forEach((line, row) => context.fillText(line, x, y + (row - (lines.length - 1) / 2) * lineHeight));
    }
    context.restore();

    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.lineWidth = 1.5;
    context.strokeStyle = '#8DA581';
    context.stroke();
    context.beginPath();
    context.arc(center, center, radius * 0.09, 0, Math.PI * 2);
    context.fillStyle = '#3D5A3E';
    context.fill();

    // Draw the fixed pointer after restoring the canvas transform.
    context.beginPath();
    context.moveTo(center - 12, 2);
    context.lineTo(center + 12, 2);
    context.lineTo(center, 23);
    context.closePath();
    context.fillStyle = '#D6A53E';
    context.fill();
  };
}

module.exports = { createWheelRenderer };
