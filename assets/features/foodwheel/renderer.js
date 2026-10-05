import { WHEEL_COLORS } from './catalog.js';
  function fitLabel(label, itemCount) {
    const maxChars = itemCount > 42 ? 7 : itemCount > 28 ? 9 :
      itemCount > 18 ? 12 : 18;
    return label.length > maxChars
      ? `${label.slice(0, Math.max(1, maxChars - 1))}…`
      : label;
  }

  function prepareCanvas(canvas) {
    const parentWidth = canvas.parentElement?.clientWidth || 320;
    const cssSize = Math.max(220, Math.min(parentWidth, 420));
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const pixelSize = Math.round(cssSize * density);

    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
    }

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(density, 0, 0, density, 0, 0);
    return { context, size: cssSize, center: cssSize / 2 };
  }

  function drawWheel(canvas,wheelItems,wheelAngle) {
    const prepared = prepareCanvas(canvas);
    if (!prepared || wheelItems.length === 0) return;

    const { context, size, center } = prepared;
    const radius = center - 7;
    const itemCount = wheelItems.length;
    const arc = (Math.PI * 2) / itemCount;
    const fontSize = itemCount > 42 ? 7 : itemCount > 30 ? 8 :
      itemCount > 20 ? 9 : itemCount > 12 ? 10 : 12;

    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);

    wheelItems.forEach((restaurant, index) => {
      const startAngle = wheelAngle + index * arc - Math.PI / 2;
      const endAngle = startAngle + arc;
      const middleAngle = startAngle + arc / 2;

      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = WHEEL_COLORS[index % WHEEL_COLORS.length];
      context.fill();
      context.strokeStyle = 'rgba(17, 24, 39, 0.88)';
      context.lineWidth = itemCount > 30 ? 1 : 2;
      context.stroke();

      context.save();
      const normalizedMiddle =
        ((middleAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const onLeft = normalizedMiddle > Math.PI / 2 &&
        normalizedMiddle < Math.PI * 1.5;
      context.rotate(onLeft ? middleAngle + Math.PI : middleAngle);
      context.textAlign = onLeft ? 'left' : 'right';
      context.textBaseline = 'middle';
      context.font =
        `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      context.fillStyle = '#fff';
      context.shadowColor = 'rgba(0, 0, 0, 0.7)';
      context.shadowBlur = 2;
      context.fillText(
        fitLabel(restaurant, itemCount),
        onLeft ? -(radius - 14) : radius - 14,
        0
      );
      context.restore();
    });

    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.strokeStyle = '#facc15';
    context.lineWidth = 5;
    context.stroke();

    context.beginPath();
    context.arc(0, 0, Math.max(48, size * 0.145), 0, Math.PI * 2);
    context.fillStyle = '#030712';
    context.fill();
    context.strokeStyle = '#facc15';
    context.lineWidth = 4;
    context.stroke();
    context.restore();
  }
export {drawWheel};
