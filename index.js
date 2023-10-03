const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
let ctdata = null;
let ctdata_depth = null;

const serbtn = document.getElementById("serbtn");

if (!("serial" in navigator)) {
  serbtn.style.display = "none";
}

serbtn.addEventListener("click", async () => {
  serbtn.style.display = "none";
  Connect(
    () => {
      if (gameInteractTimeout !== -1) {
        clearTimeout(gameInteractTimeout);
        gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
      }
      keys.set("Space", 1);
    },
    () => {
      if (gameInteractTimeout !== -1) {
        clearTimeout(gameInteractTimeout);
        gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
      }
      keys.set("Space", 0);
    }
  );
});

cv.setAttribute("tabindex", "0");
cv.focus();

const gameTimeout = 30000;

// Viewport
let Snear = 0;
let Sfar = 1;
let Sx = 0;
let Sy = 0;
let Swidth = cv.width;
let Sheight = cv.height;

let scale = 1;

cv.width = cv.offsetWidth * scale;
cv.height = cv.offsetHeight * scale;

let keys = new Map();
let prevKeys = new Map();
let rawMouseX = 0;
let rawMouseY = 0;

let buttonBits = 0;
let prevButtonBits = 0;

const MB_PRIMARY = 1;
const MB_SECONDARY = 2;
const MB_AUXILIARY = 4;
const MB_4TH = 8;
const MB_5TH = 16;

const REGISTER_POINTER_AS_BUTTON = true;

document.addEventListener("pointerrawupdate", (e) => {
  if (!REGISTER_POINTER_AS_BUTTON) {
    rawMouseX = e.x;
    rawMouseY = e.y;
  }
});

document.addEventListener("pointerdown", (e) => {
  if (REGISTER_POINTER_AS_BUTTON) {
    if (gameInteractTimeout !== -1) {
      clearTimeout(gameInteractTimeout);
      gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
    }
    keys.set("Space", 1);
  } else {
    buttonBits = e.buttons;
  }
});

document.addEventListener("pointerup", (e) => {
  if (REGISTER_POINTER_AS_BUTTON) {
    if (gameInteractTimeout !== -1) {
      clearTimeout(gameInteractTimeout);
      gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
    }
    keys.set("Space", 0);
  } else {
    buttonBits = e.buttons;
  }
});

cv.addEventListener("keydown", (e) => {
  keys.set(e.code, 1);
  if (gameInteractTimeout !== -1) {
    clearTimeout(gameInteractTimeout);
    gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
  }
});

cv.addEventListener("keyup", (e) => {
  keys.set(e.code, 0);
  if (gameInteractTimeout !== -1) {
    clearTimeout(gameInteractTimeout);
    gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
  }
});

function getKey(code) {
  return keys.has(code) ? keys.get(code) === 1 : false;
}

function getPrevKey(code) {
  return prevKeys.has(code) ? prevKeys.get(code) === 1 : false;
}

function getKeyDown(code) {
  return getKey(code) && !getPrevKey(code);
}

function getKeyUp(code) {
  return !getKey(code) && getPrevKey(code);
}

function getMouseButton(button) {
  return (buttonBits & button) != 0;
}

function getPrevMouseButton(button) {
  return (prevButtonBits & button) != 0;
}

function getMouseButtonDown(button) {
  return getMouseButton(button) && !getPrevMouseButton(button);
}

function getMouseButtonUp(button) {
  return !getMouseButton(button) && getPrevMouseButton(button);
}

window.addEventListener("resize", () => {
  updateScale(scale);
});

const updateScale = function (sc) {
  scale = sc;

  cv.width = cv.offsetWidth * scale;
  cv.height = cv.offsetHeight * scale;
  if (cv.width <= 0) cv.width = 1;
  if (cv.height <= 0) cv.height = 1;
  ctdata = null;
  ctdata_depth = null;
  clearBuffers();
};

const clearBuffers = function () {
  if (ctdata == null) {
    ctdata = ctx.createImageData(cv.width, cv.height);
  }

  if (ctdata_depth == null) {
    ctdata_depth = new Float32Array(cv.width * cv.height);
  }

  Swidth = cv.width;
  Sheight = cv.height;

  for (let i = 0; i < ctdata.data.length / 4; ++i) {
    ctdata.data[i * 4 + 0] = 0;
    ctdata.data[i * 4 + 1] = 0;
    ctdata.data[i * 4 + 2] = 0;
    ctdata.data[i * 4 + 3] = 255;
  }

  for (let i = 0; i < ctdata_depth.length; ++i) {
    ctdata_depth[i] = 1;
  }
};

let deltaE = 0;
let prevTime = 0;

const D2r = Math.PI / 180.0;

/**
 *   Renders a string to an image buffer
 *   using the native text api
 **/
let _drawNativeText_buffer = null;
let _drawNativeText_buffer_ctx = null;
const drawNativeText = (str, fontSize, fontName, color) => {
  const oldFont = ctx.font;
  ctx.font = fontSize + "px " + fontName;
  const metrics = ctx.measureText(str);
  ctx.font = oldFont;

  const pixelWidth =
    Math.max(
      1,
      metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft
    ) + 0;
  const pixelHeight =
    Math.max(
      fontSize,
      metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent
    ) + 10;

  if (_drawNativeText_buffer == null) {
    _drawNativeText_buffer = new OffscreenCanvas(pixelWidth, pixelHeight);
    _drawNativeText_buffer_ctx = _drawNativeText_buffer.getContext("2d", {
      willReadFrequently: true
    });
  } else {
    _drawNativeText_buffer.width = pixelWidth;
    _drawNativeText_buffer.height = pixelHeight;
  }

  _drawNativeText_buffer_ctx.reset();
  _drawNativeText_buffer_ctx.font = fontSize + "px " + fontName;
  _drawNativeText_buffer_ctx.fillStyle = color;
  _drawNativeText_buffer_ctx.textBaseline = "top";
  // offset by -0.5 for sub-pixel AA
  _drawNativeText_buffer_ctx.fillText(str, -0.5, -0.5);
  return _drawNativeText_buffer_ctx.getImageData(0, 0, pixelWidth, pixelHeight);
};

/// <summary>dest = source</summary>
const SRCCOPY = 0x00cc0020;
/// <summary>dest = source+(NOT alpha)*dest</summary>
const SRCOVERLAY = 0x00cc0021;
/// <summary>dest = alpha*source+(NOT alpha)*dest</summary>
const SRCBLEND = 0x00cc0022;
/// <summary>dest = source OR dest</summary>
const SRCPAINT = 0x00ee0086;
/// <summary>dest = source AND dest</summary>
const SRCAND = 0x008800c6;
/// <summary>dest = source XOR dest</summary>
const SRCINVERT = 0x00660046;
/// <summary>dest = source AND (NOT dest)</summary>
const SRCERASE = 0x00440328;
/// <summary>dest = (NOT source)</summary>
const NOTSRCCOPY = 0x00330008;
/// <summary>dest = (NOT src) AND (NOT dest)</summary>
const NOTSRCERASE = 0x001100a6;
/// <summary>dest = (NOT source) OR dest</summary>
const MERGEPAINT = 0x00bb0226;
/// <summary>dest = (NOT dest)</summary>
const DSTINVERT = 0x00550009;
/// <summary>dest = BLACK</summary>
const BLACKNESS = 0x00000042;
/// <summary>dest = WHITE</summary>
const WHITENESS = 0x00ff0062;

const BitBlt = (
  target,
  xDest,
  yDest,
  width,
  height,
  source,
  xSrc,
  ySrc,
  dwRop
) => {
  for (let i = 0; i < width * height; ++i) {
    const x = Math.floor(i % width);
    const y = Math.floor(i / width);

    if (
      y + yDest < 0 ||
      y + yDest >= target.height ||
      x + xDest < 0 ||
      x + xDest >= target.width ||
      y + ySrc < 0 ||
      y + ySrc >= source.height ||
      x + xSrc < 0 ||
      x + xSrc >= source.width
    )
      continue;

    const targetPixel = (y + yDest) * target.width + (x + xDest);
    const sourcePixel = (y + ySrc) * source.width + (x + xSrc);

    switch (dwRop) {
      case SRCCOPY:
        target.data[targetPixel * 4 + 0] = source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] = source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] = source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] = source.data[sourcePixel * 4 + 3];
        break;
      case SRCOVERLAY:
        {
          const destAlpha = (255 - source.data[sourcePixel * 4 + 3]) / 255.0;

          target.data[targetPixel * 4 + 0] =
            source.data[sourcePixel * 4 + 0] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 0]);
          target.data[targetPixel * 4 + 1] =
            source.data[sourcePixel * 4 + 1] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 1]);
          target.data[targetPixel * 4 + 2] =
            source.data[sourcePixel * 4 + 2] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 2]);
          target.data[targetPixel * 4 + 3] =
            source.data[sourcePixel * 4 + 3] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 3]);
        }
        break;
      case SRCBLEND:
        {
          const srcAlpha = source.data[sourcePixel * 4 + 3] / 255.0;
          const destAlpha = 1 - srcAlpha;

          target.data[targetPixel * 4 + 0] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 0]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 0]);
          target.data[targetPixel * 4 + 1] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 1]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 1]);
          target.data[targetPixel * 4 + 2] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 2]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 2]);
          target.data[targetPixel * 4 + 3] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 3]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 3]);
        }
        break;
      case SRCPAINT:
        target.data[targetPixel * 4 + 0] |= source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] |= source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] |= source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] |= source.data[sourcePixel * 4 + 3];
        break;
      case SRCAND:
        target.data[targetPixel * 4 + 0] &= source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] &= source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] &= source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] &= source.data[sourcePixel * 4 + 3];
        break;
      case SRCINVERT:
        target.data[targetPixel * 4 + 0] =
          source.data[sourcePixel * 4 + 0] ^ target.data[targetPixel * 4 + 0];
        target.data[targetPixel * 4 + 1] =
          source.data[sourcePixel * 4 + 1] ^ target.data[targetPixel * 4 + 1];
        target.data[targetPixel * 4 + 2] =
          source.data[sourcePixel * 4 + 2] ^ target.data[targetPixel * 4 + 2];
        target.data[targetPixel * 4 + 3] =
          source.data[sourcePixel * 4 + 3] ^ target.data[targetPixel * 4 + 3];
        break;
      case SRCERASE:
        target.data[targetPixel * 4 + 0] =
          source.data[sourcePixel * 4 + 0] &
          (255 - target.data[targetPixel * 4 + 0]);
        target.data[targetPixel * 4 + 1] =
          source.data[sourcePixel * 4 + 1] &
          (255 - target.data[targetPixel * 4 + 1]);
        target.data[targetPixel * 4 + 2] =
          source.data[sourcePixel * 4 + 2] &
          (255 - target.data[targetPixel * 4 + 2]);
        target.data[targetPixel * 4 + 3] =
          source.data[sourcePixel * 4 + 3] &
          (255 - target.data[targetPixel * 4 + 3]);
        break;
      case NOTSRCCOPY:
        target.data[targetPixel * 4 + 0] =
          255 - source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] =
          255 - source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] =
          255 - source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] =
          255 - source.data[sourcePixel * 4 + 3];
        break;
      case NOTSRCERASE:
        target.data[targetPixel * 4 + 0] =
          (255 - source.data[sourcePixel * 4 + 0]) &
          (255 - target.data[targetPixel * 4 + 0]);
        target.data[targetPixel * 4 + 1] =
          (255 - source.data[sourcePixel * 4 + 1]) &
          (255 - target.data[targetPixel * 4 + 1]);
        target.data[targetPixel * 4 + 2] =
          (255 - source.data[sourcePixel * 4 + 2]) &
          (255 - target.data[targetPixel * 4 + 2]);
        target.data[targetPixel * 4 + 3] =
          (255 - source.data[sourcePixel * 4 + 3]) &
          (255 - target.data[targetPixel * 4 + 3]);
        break;
      case MERGEPAINT:
        target.data[targetPixel * 4 + 0] |=
          255 - source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] |=
          255 - source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] |=
          255 - source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] |=
          255 - source.data[sourcePixel * 4 + 3];
        break;
      case DSTINVERT:
        target.data[targetPixel * 4 + 0] =
          255 - target.data[targetPixel * 4 + 0];
        target.data[targetPixel * 4 + 1] =
          255 - target.data[targetPixel * 4 + 1];
        target.data[targetPixel * 4 + 2] =
          255 - target.data[targetPixel * 4 + 2];
        target.data[targetPixel * 4 + 3] =
          255 - target.data[targetPixel * 4 + 3];
        break;
      case BLACKNESS:
        target.data[targetPixel * 4 + 0] = 0;
        target.data[targetPixel * 4 + 1] = 0;
        target.data[targetPixel * 4 + 2] = 0;
        target.data[targetPixel * 4 + 3] = 0;
        break;
      case WHITENESS:
        target.data[targetPixel * 4 + 0] = 255;
        target.data[targetPixel * 4 + 1] = 255;
        target.data[targetPixel * 4 + 2] = 255;
        target.data[targetPixel * 4 + 3] = 255;
        break;
    }
  }
};

const StretchBlt = (
  target,
  xDest,
  yDest,
  widthDest,
  heightDest,
  source,
  xSrc,
  ySrc,
  widthSrc,
  heightSrc,
  dwRop
) => {
  for (let i = 0; i < widthDest * heightDest; ++i) {
    const x = Math.floor(i % widthDest);
    const y = Math.floor(i / widthDest);

    const u = x / widthDest;
    const v = y / heightDest;
    const xs = Math.floor(u * widthSrc);
    const ys = Math.floor(v * heightSrc);

    if (
      y + yDest < 0 ||
      y + yDest >= target.height ||
      x + xDest < 0 ||
      x + xDest >= target.width ||
      ys + ySrc < 0 ||
      ys + ySrc >= source.height ||
      xs + xSrc < 0 ||
      xs + xSrc >= source.width
    )
      continue;

    const targetPixel = (y + yDest) * target.width + (x + xDest);
    const sourcePixel = (ys + ySrc) * source.width + (xs + xSrc);

    switch (dwRop) {
      case SRCCOPY:
        target.data[targetPixel * 4 + 0] = source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] = source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] = source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] = source.data[sourcePixel * 4 + 3];
        break;
      case SRCOVERLAY:
        {
          const destAlpha = (255 - source.data[sourcePixel * 4 + 3]) / 255.0;

          target.data[targetPixel * 4 + 0] =
            source.data[sourcePixel * 4 + 0] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 0]);
          target.data[targetPixel * 4 + 1] =
            source.data[sourcePixel * 4 + 1] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 1]);
          target.data[targetPixel * 4 + 2] =
            source.data[sourcePixel * 4 + 2] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 2]);
          target.data[targetPixel * 4 + 3] =
            source.data[sourcePixel * 4 + 3] +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 3]);
        }
        break;
      case SRCBLEND:
        {
          const srcAlpha = source.data[sourcePixel * 4 + 3] / 255.0;
          const destAlpha = 1 - srcAlpha;

          target.data[targetPixel * 4 + 0] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 0]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 0]);
          target.data[targetPixel * 4 + 1] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 1]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 1]);
          target.data[targetPixel * 4 + 2] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 2]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 2]);
          target.data[targetPixel * 4 + 3] =
            Math.floor(srcAlpha * source.data[sourcePixel * 4 + 3]) +
            Math.floor(destAlpha * target.data[targetPixel * 4 + 3]);
        }
        break;
      case SRCPAINT:
        target.data[targetPixel * 4 + 0] |= source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] |= source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] |= source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] |= source.data[sourcePixel * 4 + 3];
        break;
      case SRCAND:
        target.data[targetPixel * 4 + 0] &= source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] &= source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] &= source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] &= source.data[sourcePixel * 4 + 3];
        break;
      case SRCINVERT:
        target.data[targetPixel * 4 + 0] =
          source.data[sourcePixel * 4 + 0] ^ target.data[targetPixel * 4 + 0];
        target.data[targetPixel * 4 + 1] =
          source.data[sourcePixel * 4 + 1] ^ target.data[targetPixel * 4 + 1];
        target.data[targetPixel * 4 + 2] =
          source.data[sourcePixel * 4 + 2] ^ target.data[targetPixel * 4 + 2];
        target.data[targetPixel * 4 + 3] =
          source.data[sourcePixel * 4 + 3] ^ target.data[targetPixel * 4 + 3];
        break;
      case SRCERASE:
        target.data[targetPixel * 4 + 0] =
          source.data[sourcePixel * 4 + 0] &
          (255 - target.data[targetPixel * 4 + 0]);
        target.data[targetPixel * 4 + 1] =
          source.data[sourcePixel * 4 + 1] &
          (255 - target.data[targetPixel * 4 + 1]);
        target.data[targetPixel * 4 + 2] =
          source.data[sourcePixel * 4 + 2] &
          (255 - target.data[targetPixel * 4 + 2]);
        target.data[targetPixel * 4 + 3] =
          source.data[sourcePixel * 4 + 3] &
          (255 - target.data[targetPixel * 4 + 3]);
        break;
      case NOTSRCCOPY:
        target.data[targetPixel * 4 + 0] =
          255 - source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] =
          255 - source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] =
          255 - source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] =
          255 - source.data[sourcePixel * 4 + 3];
        break;
      case NOTSRCERASE:
        target.data[targetPixel * 4 + 0] =
          (255 - source.data[sourcePixel * 4 + 0]) &
          (255 - target.data[targetPixel * 4 + 0]);
        target.data[targetPixel * 4 + 1] =
          (255 - source.data[sourcePixel * 4 + 1]) &
          (255 - target.data[targetPixel * 4 + 1]);
        target.data[targetPixel * 4 + 2] =
          (255 - source.data[sourcePixel * 4 + 2]) &
          (255 - target.data[targetPixel * 4 + 2]);
        target.data[targetPixel * 4 + 3] =
          (255 - source.data[sourcePixel * 4 + 3]) &
          (255 - target.data[targetPixel * 4 + 3]);
        break;
      case MERGEPAINT:
        target.data[targetPixel * 4 + 0] |=
          255 - source.data[sourcePixel * 4 + 0];
        target.data[targetPixel * 4 + 1] |=
          255 - source.data[sourcePixel * 4 + 1];
        target.data[targetPixel * 4 + 2] |=
          255 - source.data[sourcePixel * 4 + 2];
        target.data[targetPixel * 4 + 3] |=
          255 - source.data[sourcePixel * 4 + 3];
        break;
      case DSTINVERT:
        target.data[targetPixel * 4 + 0] =
          255 - target.data[targetPixel * 4 + 0];
        target.data[targetPixel * 4 + 1] =
          255 - target.data[targetPixel * 4 + 1];
        target.data[targetPixel * 4 + 2] =
          255 - target.data[targetPixel * 4 + 2];
        target.data[targetPixel * 4 + 3] =
          255 - target.data[targetPixel * 4 + 3];
        break;
      case BLACKNESS:
        target.data[targetPixel * 4 + 0] = 0;
        target.data[targetPixel * 4 + 1] = 0;
        target.data[targetPixel * 4 + 2] = 0;
        target.data[targetPixel * 4 + 3] = 0;
        break;
      case WHITENESS:
        target.data[targetPixel * 4 + 0] = 255;
        target.data[targetPixel * 4 + 1] = 255;
        target.data[targetPixel * 4 + 2] = 255;
        target.data[targetPixel * 4 + 3] = 255;
        break;
    }
  }
};

const drawBlendedText = (str, fontSize, fontName, color, x, y, layout) => {
  const buffer = drawNativeText(str, fontSize, fontName, color);
  if (layout === 1) {
    x -= buffer.width / 2;
    y -= buffer.height / 2;
  }
  BitBlt(
    ctdata,
    Math.floor(x),
    Math.floor(y),
    buffer.width,
    buffer.height,
    buffer,
    0,
    0,
    SRCBLEND
  );
};

const drawRectangle = (x, y, w, h, t, stroke, fill) => {
  for (let i = 0; i < w * h; ++i) {
    const px = Math.floor(i % w);
    const py = Math.floor(i / w);
    if (
      x + px >= 0 &&
      x + px < ctdata.width &&
      y + py >= 0 &&
      y + py < ctdata.height
    ) {
      const pixel = (y + py) * ctdata.width + (x + px);

      if (px < t || px >= w - t || py < t || (py >= h - t && stroke[3] !== 0)) {
        ctdata.data[pixel * 4 + 0] = stroke[0];
        ctdata.data[pixel * 4 + 1] = stroke[1];
        ctdata.data[pixel * 4 + 2] = stroke[2];
        ctdata.data[pixel * 4 + 3] = stroke[3];
      } else if (fill[3] !== 0) {
        ctdata.data[pixel * 4 + 0] = fill[0];
        ctdata.data[pixel * 4 + 1] = fill[1];
        ctdata.data[pixel * 4 + 2] = fill[2];
        ctdata.data[pixel * 4 + 3] = fill[3];
      }
    }
  }
};

const fastSqrt = (x) => {
  const x2 = x + 2;
  return 1 + 0.25 * x - 2.86 / (x * x2 * x2 * x2 + 2.86);
};

const drawFastShadow = (x, y, w, h, size, start, end) => {
  const size2 = size * 2;
  for (let i = 0; i < (w + size2) * (h + size2); ++i) {
    const px = Math.floor(i % (w + size2)) - size;
    const py = Math.floor(i / (w + size2)) - size;

    if (
      (px < 0 || py < 0 || px >= w || py >= h) &&
      y + py >= 0 &&
      y + py < ctdata.height &&
      x + px >= 0 &&
      x + px < ctdata.width
    ) {
      const dx = (px < 0 ? px : px >= w ? px - w : 0) / size;
      const dy = (py < 0 ? py : py >= h ? py - h : 0) / size;
      const ddxy = dx * dx + dy * dy;

      const randomFactor = 0.4 * ddxy * (Math.random() * 2 - 1);
      const ditherPattern =
        (Math.abs((px + randomFactor) * (py - randomFactor) + 2 * i) % 4) / 4;
      const distance = Math.max(
        0,
        Math.min(1, fastSqrt(ddxy + 0.01 * ditherPattern))
      );
      const invDistance = 1 - distance;

      const pixel = (y + py) * ctdata.width + (x + px);

      const gamma = 0.6;
      const srcColor = [
        Math.pow((invDistance * start[0] + distance * end[0]) / 255, 1 / gamma),
        Math.pow((invDistance * start[1] + distance * end[1]) / 255, 1 / gamma),
        Math.pow((invDistance * start[2] + distance * end[2]) / 255, 1 / gamma),
        Math.pow((invDistance * start[3] + distance * end[3]) / 255, 1 / gamma)
      ];

      const destColor = [
        ctdata.data[pixel * 4 + 0] / 255,
        ctdata.data[pixel * 4 + 1] / 255,
        ctdata.data[pixel * 4 + 2] / 255,
        ctdata.data[pixel * 4 + 3] / 255
      ];

      const a = srcColor[3] + destColor[3] * (1 - srcColor[3]);
      const r =
        (srcColor[0] * srcColor[3] +
          destColor[0] * destColor[3] * (1 - srcColor[3])) /
        a;
      const g =
        (srcColor[1] * srcColor[3] +
          destColor[1] * destColor[3] * (1 - srcColor[3])) /
        a;
      const b =
        (srcColor[2] * srcColor[3] +
          destColor[2] * destColor[3] * (1 - srcColor[3])) /
        a;

      ctdata.data[pixel * 4 + 0] = Math.floor(r * 255);
      ctdata.data[pixel * 4 + 1] = Math.floor(g * 255);
      ctdata.data[pixel * 4 + 2] = Math.floor(b * 255);
      ctdata.data[pixel * 4 + 3] = Math.floor(a * 255);
    }
  }
};

const setPixel = (x, y, stroke) => {
  if (x < 0 || y < 0 || x >= ctdata.width || y >= ctdata.height) return;
  const pixel = y * ctdata.width + x;
  const srcColor = [
    stroke[0] / 255,
    stroke[1] / 255,
    stroke[2] / 255,
    stroke[3] / 255
  ];

  const destColor = [
    ctdata.data[pixel * 4 + 0] / 255,
    ctdata.data[pixel * 4 + 1] / 255,
    ctdata.data[pixel * 4 + 2] / 255,
    ctdata.data[pixel * 4 + 3] / 255
  ];

  const a = srcColor[3] + destColor[3] * (1 - srcColor[3]);
  const r =
    (srcColor[0] * srcColor[3] +
      destColor[0] * destColor[3] * (1 - srcColor[3])) /
    a;
  const g =
    (srcColor[1] * srcColor[3] +
      destColor[1] * destColor[3] * (1 - srcColor[3])) /
    a;
  const b =
    (srcColor[2] * srcColor[3] +
      destColor[2] * destColor[3] * (1 - srcColor[3])) /
    a;

  ctdata.data[pixel * 4 + 0] = Math.floor(r * 255);
  ctdata.data[pixel * 4 + 1] = Math.floor(g * 255);
  ctdata.data[pixel * 4 + 2] = Math.floor(b * 255);
  ctdata.data[pixel * 4 + 3] = Math.floor(a * 255);
};

const setPixelAA = (x, y, aa, stroke) => {
  setPixel(x, y, [
    stroke[0],
    stroke[1],
    stroke[2],
    (stroke[3] / 255) * (1 - aa / 255) * 255
  ]);
};

const drawLine = (x0, y0, x1, y1, th, stroke) => {
  let dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1;
  let dy = Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy,
    e2,
    x2,
    y2; /* error value e_xy */
  let ed = dx + dy == 0 ? 1 : Math.sqrt(dx * dx + dy * dy);

  for (th = (th + 1) / 2; ; ) {
    /* pixel loop */
    setPixelAA(
      x0,
      y0,
      Math.max(0, 255 * (Math.abs(err - dx + dy) / ed - th + 1)),
      stroke
    );
    e2 = err;
    x2 = x0;
    if (2 * e2 >= -dx) {
      /* x step */
      for (e2 += dy, y2 = y0; e2 < ed * th && (y1 != y2 || dx > dy); e2 += dx)
        setPixelAA(
          x0,
          (y2 += sy),
          Math.max(0, 255 * (Math.abs(e2) / ed - th + 1)),
          stroke
        );
      if (x0 == x1) break;
      e2 = err;
      err -= dy;
      x0 += sx;
    }
    if (2 * e2 <= dy) {
      /* y step */
      for (e2 = dx - e2; e2 < ed * th && (x1 != x2 || dx < dy); e2 += dy)
        setPixelAA(
          (x2 += sx),
          y0,
          Math.max(0, 255 * (Math.abs(e2) / ed - th + 1)),
          stroke
        );
      if (y0 == y1) break;
      err += dx;
      y0 += sy;
    }
  }
};

const drawGameCard = (card, playKeyBar) => {
  const originX = card.x + card.w / 2;
  const originY = card.y + card.h / 2;
  const x = Math.ceil(((card.x - originX) * card.scale + originX) * scale);
  const y = Math.ceil(((card.y - originY) * card.scale + originY) * scale);
  const width = Math.ceil(card.w * card.scale * scale);
  const height = Math.ceil(card.h * card.scale * scale);

  const borderWidth = Math.ceil(5 * card.scale * scale);

  drawRectangle(
    x,
    y,
    width,
    height,
    borderWidth,
    [236, 66, 245, 255],
    [5, 7, 54, 255]
  );

  if (card.shadow > 0) {
    drawFastShadow(
      x,
      y,
      width,
      height,
      Math.ceil(card.shadow * card.scale * scale),
      [236, 66, 245, 255],
      [236, 66, 245, 0]
    );
  }

  drawBlendedText(
    card.title,
    (24 * card.scale * scale).toFixed(),
    "Helvetica",
    "#fff",
    x,
    y
  );

  drawBlendedText(
    "High Score: " + Number(card.score()).toFixed(),
    (24 * card.scale * scale).toFixed(),
    "Helvetica",
    "#fff",
    x,
    y + 30 * scale
  );

  const playKeyBarHeight = Math.ceil(10 * card.scale * scale);
  drawRectangle(
    x + borderWidth,
    y + height - playKeyBarHeight - borderWidth,
    Math.round(playKeyBar * (width - borderWidth * 2)),
    playKeyBarHeight,
    0,
    [],
    [94, 63, 181, 255]
  );
};

const remap = function (v, frommin, frommax, tomin, tomax) {
  return tomin + ((v - frommin) / (frommax - frommin)) * (tomax - tomin);
};

let sc = scale;
const targetDelta = 1.0 / 55; // <= 60 because of v-sync

const GAME_MENU = 0;
const GAME_FLAPPYBIRD = 1;
const GAME_CIRCLEFLIP = 2;
const GAME_PINGPONG = 3;

let currentGame = GAME_MENU;

const menuCards = [
  {
    title: "Flappy Bird",
    score: () =>
      localStorage["_compdog_inc_singlebuttongames_flappybird_highscore"] || 0,
    x: 100,
    y: 100,
    w: 300,
    h: 400,
    targetShadow: 0,
    shadow: 0,
    targetScale: 1,
    scale: 1,
    game: GAME_FLAPPYBIRD
  },
  {
    title: "Circle Flip",
    score: () =>
      localStorage["_compdog_inc_singlebuttongames_circleflip_highscore"] || 0,
    x: 500,
    y: 100,
    w: 300,
    h: 400,
    targetShadow: 0,
    shadow: 0,
    targetScale: 1,
    scale: 1,
    game: GAME_CIRCLEFLIP
  },
  {
    title: "Ping Pong",
    score: () =>
      localStorage["_compdog_inc_singlebuttongames_pingpong_highscore"] || 0,
    x: 900,
    y: 100,
    w: 300,
    h: 400,
    targetShadow: 0,
    shadow: 0,
    targetScale: 1,
    scale: 1,
    game: GAME_PINGPONG
  }
];

let selectedCard = -1;
let buttonPressTimer = 0;
let buttonHeldDown = false;

let selectedGameButton = -1;
let restartGameButtonShadow = 0;
let restartGameButtonTargetShadow = 0;
let menuGameButtonShadow = 0;
let menuGameButtonTargetShadow = 0;

let currentCardPlaying = null;

let returningToMenu = false;

let targetOverlay = 0;
let currentOverlay = 0;

let gameInteractTimeout = -1;

let flappyBirdPosition = [0, 0];
let flappyBirdVelocity = [0, 0];
let flappyBirdStarted = false;
let flappyBirdObstacles = [];
let flappyBirdCoins = [];
let flappyBirdObstacleDistance = 8;
let flappyBirdCoinDistance = 5;
let flappyBirdTimeScale = 0;
let flappyBirdScore = 0;
let flappyBirdHighScore =
  localStorage["_compdog_inc_singlebuttongames_flappybird_highscore"] || 0;
const birdWr = (70 / 50) * 0.5;
const birdHr = 0.5;

let circleFlipStarted = false;
let circleFlipLightCount = 32;
let circleFlipCurrentLight = 0;
let circleFlipTargetLight = -1;
let circleFlipPrevTargetLight = -1;
let circleFlipScoreDiscourager = 0;
let circleFlipMoveDir = 1;
let circleFlipLightTimer = 0;
let circleFlipBarrierIndex = 0;
let circleFlipScore = 0;
let circleFlipTimeLeft = 60;
let circleFlipHighScore =
  localStorage["_compdog_inc_singlebuttongames_circleflip_highscore"] || 0;

const normalize = function (v) {
  const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  return [v[0] / mag, v[1] / mag];
};

const mulv = function (f, v) {
  return [v[0] * f, v[1] * f];
};

const pxToPingPong = (p) => {
  return [(p[0] / cv.width) * 10, (p[1] / cv.height) * 10];
};

let pingPongStarted = false;
let pingPongScore = 0;
let pingPongPaddleSize = 2;
let pingPongPaddleOp = 5 - pingPongPaddleSize / 2;
let pingPongPaddlePlayer = 5 - pingPongPaddleSize / 2;
let pingPongBallPos = [
  10 - pxToPingPong([40 * scale, 0])[0] - pxToPingPong([20 * scale, 0])[0],
  pingPongPaddlePlayer +
    pingPongPaddleSize / 2 -
    pxToPingPong([0, 20 * scale])[1] / 2
];
let pingPongBallVel = mulv(4, normalize([-1, -1]));
let pingPongColPlayer = true;
let pingPongColOp = false;
let pingPongOpTimer = 0;
let pingPongOpInput = false;
let pingPongHighScore =
  localStorage["_compdog_inc_singlebuttongames_pingpong_highscore"] || 0;

const playCard = (card) => {
  if (currentCardPlaying == null) {
    currentCardPlaying = card;
    selectedCard = -1;
    targetOverlay = 100;
  }
};

const returnToMenu = () => {
  if (!returningToMenu) {
    clearTimeout(gameInteractTimeout);
    gameInteractTimeout = -1;
    returningToMenu = true;
    selectedCard = -1;
    targetOverlay = 100;
    selectedGameButton = -1;
    restartGameButtonShadow = 0;
    restartGameButtonTargetShadow = 0;
    menuGameButtonShadow = 0;
    menuGameButtonTargetShadow = 0;
  }
};

const collidePoint = (b, pt) => {
  return pt.x >= b.x1 && pt.x <= b.x2 && pt.y >= b.y1 && pt.y <= b.y2;
};

const collideAABB = (b1, b2) => {
  return (
    collidePoint(b1, { x: b2.x1, y: b2.y1 }) ||
    collidePoint(b1, { x: b2.x2, y: b2.y1 }) ||
    collidePoint(b1, { x: b2.x1, y: b2.y2 }) ||
    collidePoint(b1, { x: b2.x2, y: b2.y2 }) ||
    collidePoint(b2, { x: b1.x1, y: b1.y1 }) ||
    collidePoint(b2, { x: b1.x2, y: b1.y1 }) ||
    collidePoint(b2, { x: b1.x1, y: b1.y2 }) ||
    collidePoint(b2, { x: b1.x2, y: b1.y2 })
  );
};

const dotV = function (a, b) {
  return a[0] * b[0] + a[1] * b[1];
};

const reflect = function (i, n) {
  n = normalize(n);
  const dot2 = 2 * dotV(i, n);
  return [i[0] - n[0] * dot2, i[1] - n[1] * dot2];
};

const updateGame = (delta) => {
  if (currentCardPlaying != null && currentOverlay == 100) {
    currentGame = currentCardPlaying.game;
    if (currentGame != GAME_MENU) {
      gameInteractTimeout = setTimeout(returnToMenu, gameTimeout);
    } else {
      clearTimeout(gameInteractTimeout);
      gameInteractTimeout = -1;
    }
    currentCardPlaying = null;
    targetOverlay = 0;
  }

  if (returningToMenu && currentOverlay == 100) {
    currentGame = GAME_MENU;
    returningToMenu = false;
    targetOverlay = 0;
    flappyBirdStarted = false;
    circleFlipStarted = false;
  }

  switch (currentGame) {
    case GAME_MENU:
      {
        if (getKeyDown("Space")) {
          buttonPressTimer = 0;
          buttonHeldDown = false;
        } else if (getKey("Space") && !buttonHeldDown) {
          buttonPressTimer += delta;
          if (buttonPressTimer >= 1) {
            buttonHeldDown = true;
            buttonPressTimer = 0;
            playCard(menuCards[selectedCard]);
          }
        } else if (getKeyUp("Space") && !buttonHeldDown) {
          buttonPressTimer = 0;
          selectedCard++;
          if (selectedCard >= menuCards.length) selectedCard = 0;
        } else {
          buttonPressTimer = 0;
        }

        for (let i = 0; i < menuCards.length; ++i) {
          const hover =
            rawMouseX >= menuCards[i].x &&
            rawMouseX <= menuCards[i].x + menuCards[i].w &&
            rawMouseY >= menuCards[i].y &&
            rawMouseY <= menuCards[i].y + menuCards[i].h;
          if (hover && getMouseButtonDown(MB_PRIMARY)) {
            playCard(menuCards[i]);
          }
          if (hover || selectedCard === i) {
            menuCards[i].targetShadow = 100;
            menuCards[i].targetScale = 1.1;
          } else {
            menuCards[i].targetShadow = 0;
            menuCards[i].targetScale = 1;
          }
          menuCards[i].shadow +=
            (menuCards[i].targetShadow - menuCards[i].shadow) * delta * 12;
          menuCards[i].scale +=
            (menuCards[i].targetScale - menuCards[i].scale) * delta * 6;
        }
      }
      break;
    case GAME_FLAPPYBIRD:
      {
        const reset = () => {
          flappyBirdStarted = false;
          flappyBirdTimeScale = 0;
          flappyBirdPosition = [0, 0];
          flappyBirdVelocity = [0, 0];
          flappyBirdObstacles = [];
          flappyBirdCoins = [];
          flappyBirdObstacleDistance = 8;
          flappyBirdCoinDistance = 5;
          flappyBirdScore = 0;
        };

        if (flappyBirdStarted) {
          flappyBirdTimeScale += delta / 5;
          flappyBirdObstacleDistance += delta / 10;
          flappyBirdCoinDistance += delta / 10;
          let lastX = flappyBirdObstacles.length === 0 ? 10 : -999;
          for (const obst of flappyBirdObstacles) {
            obst.x -= delta * 4 * (1 + flappyBirdTimeScale / 10);
            if (obst.x > lastX) lastX = obst.x;

            if (
              collidePoint(
                {
                  x1: obst.x,
                  y1: obst.y,
                  x2: obst.x + obst.w,
                  y2: obst.y + obst.h
                },
                {
                  x: flappyBirdPosition[0] + birdWr / 2,
                  y: flappyBirdPosition[1] - birdHr / 2
                }
              )
            ) {
              reset();
            }
          }

          if (lastX < 10 + flappyBirdObstacleDistance) {
            const gap = remap(Math.random(), 0, 1, 2, 5);
            const openTop = remap(Math.random(), 0, 1, -5 + gap, 5);
            const openBottom = openTop - gap;
            flappyBirdObstacles.push({
              x: lastX + flappyBirdObstacleDistance,
              y: openTop,
              w: 1.5,
              h: 5 - openTop
            });
            flappyBirdObstacles.push({
              x: lastX + flappyBirdObstacleDistance,
              y: -5,
              w: 1.5,
              h: openBottom + 5
            });
            flappyBirdCoins.push({
              x:
                remap(Math.random(), 0, 1, 0, 1.5) +
                lastX +
                flappyBirdObstacleDistance,
              y: remap(Math.random(), 0, 1, openTop, openBottom),
              w: 0.4,
              h: 0.5,
              dirty: false
            });
          }

          flappyBirdObstacles = flappyBirdObstacles.filter((o) => o.x > -10);
        }

        if (flappyBirdStarted) {
          let lastX = flappyBirdCoins.length === 0 ? 10 : -999;
          for (const coin of flappyBirdCoins) {
            coin.x -= delta * 4 * (1 + flappyBirdTimeScale / 10);
            if (coin.x > lastX) lastX = coin.x;

            if (
              collideAABB(
                {
                  x1: coin.x,
                  x2: coin.x + coin.w,
                  y1: coin.y,
                  y2: coin.y + coin.h
                },
                {
                  x1: flappyBirdPosition[0],
                  x2: flappyBirdPosition[0] + birdWr,
                  y1: flappyBirdPosition[1],
                  y2: flappyBirdPosition[1] + birdHr
                }
              )
            ) {
              coin.dirty = true;
              flappyBirdScore++;
              if (flappyBirdScore > flappyBirdHighScore) {
                flappyBirdHighScore = flappyBirdScore;
                localStorage.setItem(
                  "_compdog_inc_singlebuttongames_flappybird_highscore",
                  flappyBirdHighScore
                );
              }
            }
          }

          if (lastX < 10 + flappyBirdCoinDistance) {
            flappyBirdCoins.push({
              x: lastX + flappyBirdCoins,
              y: remap(Math.random(), 0, 1, -5, 5),
              w: 0.4,
              h: 0.5,
              dirty: false
            });
          }

          flappyBirdCoins = flappyBirdCoins.filter(
            (o) => o.x > -10 && !o.dirty
          );
        }

        let yForce = flappyBirdStarted
          ? -9.81 * (1 + flappyBirdTimeScale / 50)
          : 0;

        if (flappyBirdStarted && getKeyDown("Space")) {
          flappyBirdVelocity[1] = 5 * (1 + flappyBirdTimeScale / 20);
        }

        flappyBirdVelocity[1] += yForce * delta;
        flappyBirdPosition[0] += flappyBirdVelocity[0] * delta;
        flappyBirdPosition[1] += flappyBirdVelocity[1] * delta;

        if (flappyBirdPosition[1] > 5) {
          flappyBirdPosition[1] = 5;
          flappyBirdVelocity[1] = 0;
        }

        if (flappyBirdPosition[1] < -5 + birdHr) {
          reset();
        }

        if (!flappyBirdStarted) {
          if (getKeyDown("Space")) {
            buttonPressTimer = 0;
            buttonHeldDown = false;
          } else if (getKey("Space") && !buttonHeldDown) {
            buttonPressTimer += delta;
            if (buttonPressTimer >= 1) {
              buttonHeldDown = true;
              buttonPressTimer = 0;
              if (selectedGameButton === 0) {
                flappyBirdStarted = true;
              } else if (selectedGameButton === 1) {
                returnToMenu();
              }
              selectedGameButton = -1;
            }
          } else if (getKeyUp("Space") && !buttonHeldDown) {
            buttonPressTimer = 0;
            selectedGameButton++;
            if (selectedGameButton >= 2) selectedGameButton = 0;
          } else {
            buttonPressTimer = 0;
          }
        }

        if (selectedGameButton === 0) restartGameButtonTargetShadow = 20;
        else restartGameButtonTargetShadow = 0;

        if (selectedGameButton === 1) menuGameButtonTargetShadow = 20;
        else menuGameButtonTargetShadow = 0;

        restartGameButtonShadow +=
          (restartGameButtonTargetShadow - restartGameButtonShadow) *
          delta *
          12;

        menuGameButtonShadow +=
          (menuGameButtonTargetShadow - menuGameButtonShadow) * delta * 12;
      }
      break;
    case GAME_CIRCLEFLIP:
      {
        const reset = () => {
          circleFlipStarted = false;
          circleFlipScore = 0;
          circleFlipTimeLeft = 60;
          circleFlipLightTimer = 0;
          circleFlipMoveDir = 1;
          circleFlipCurrentLight = 0;
          circleFlipBarrierIndex = 0;
          circleFlipTargetLight = -1;
          circleFlipScoreDiscourager = 0;
        };

        if (circleFlipStarted) {
          circleFlipTimeLeft -= delta;
          if (circleFlipTimeLeft <= 0) {
            reset();
          }
          circleFlipLightTimer += delta;
          if (circleFlipLightTimer >= 0.03) {
            circleFlipLightTimer = 0;
            circleFlipCurrentLight += circleFlipMoveDir;
            if (circleFlipCurrentLight >= circleFlipLightCount) {
              circleFlipCurrentLight = 0;
            }
            if (circleFlipCurrentLight < 0)
              circleFlipCurrentLight = circleFlipLightCount - 1;
          }

          circleFlipBarrierIndex += delta * 4;
          if (circleFlipBarrierIndex >= circleFlipLightCount)
            circleFlipBarrierIndex = 0;

          const checkPos = circleFlipCurrentLight + circleFlipMoveDir;
          const d0 = checkPos - circleFlipBarrierIndex;
          const d1 = checkPos + circleFlipLightCount - circleFlipBarrierIndex;
          const d2 = checkPos - circleFlipBarrierIndex - circleFlipLightCount;
          const da0 = Math.abs(d0);
          const da1 = Math.abs(d1);
          const da2 = Math.abs(d2);
          const dr = da1 < da2 ? (da0 < da1 ? d0 : d1) : da0 < da2 ? d0 : d2;
          if (Math.abs(dr) < 0.8) {
            circleFlipMoveDir *= -1;
          }

          if (getKeyDown("Space")) {
            if (circleFlipCurrentLight === circleFlipTargetLight) {
              circleFlipScore++;
              if (circleFlipScore > circleFlipHighScore) {
                circleFlipHighScore = circleFlipScore;
                localStorage.setItem(
                  "_compdog_inc_singlebuttongames_circleflip_highscore",
                  circleFlipHighScore
                );
              }
              circleFlipScoreDiscourager++;
              if (circleFlipScoreDiscourager >= 2) {
                circleFlipScoreDiscourager = 0;
                circleFlipTargetLight = Math.round(
                  remap(Math.random(), 0, 1, 0, circleFlipLightCount - 1)
                );
              }
            } else {
              circleFlipTargetLight = circleFlipCurrentLight;
              circleFlipScoreDiscourager = 0;
            }
            circleFlipMoveDir *= -1;
          }
        } else {
          if (getKeyDown("Space")) {
            buttonPressTimer = 0;
            buttonHeldDown = false;
          } else if (getKey("Space") && !buttonHeldDown) {
            buttonPressTimer += delta;
            if (buttonPressTimer >= 1) {
              buttonHeldDown = true;
              buttonPressTimer = 0;
              if (selectedGameButton === 0) {
                circleFlipStarted = true;
                circleFlipTargetLight = Math.round(
                  remap(Math.random(), 0, 1, 0, circleFlipLightCount - 1)
                );
              } else if (selectedGameButton === 1) {
                returnToMenu();
              }
              selectedGameButton = -1;
            }
          } else if (getKeyUp("Space") && !buttonHeldDown) {
            buttonPressTimer = 0;
            selectedGameButton++;
            if (selectedGameButton >= 2) selectedGameButton = 0;
          } else {
            buttonPressTimer = 0;
          }
        }
        if (selectedGameButton === 0) restartGameButtonTargetShadow = 20;
        else restartGameButtonTargetShadow = 0;

        if (selectedGameButton === 1) menuGameButtonTargetShadow = 20;
        else menuGameButtonTargetShadow = 0;

        restartGameButtonShadow +=
          (restartGameButtonTargetShadow - restartGameButtonShadow) *
          delta *
          12;

        menuGameButtonShadow +=
          (menuGameButtonTargetShadow - menuGameButtonShadow) * delta * 12;
      }
      break;
    case GAME_PINGPONG:
      {
        const reset = () => {
          pingPongStarted = false;
          pingPongScore = 0;
          pingPongPaddleSize = 2;
          pingPongPaddleOp = 5 - pingPongPaddleSize / 2;
          pingPongPaddlePlayer = 5 - pingPongPaddleSize / 2;
          pingPongBallPos = [
            10 -
              pxToPingPong([40 * scale, 0])[0] -
              pxToPingPong([20 * scale, 0])[0],
            pingPongPaddlePlayer +
              pingPongPaddleSize / 2 -
              pxToPingPong([0, 20 * scale])[1] / 2
          ];
          pingPongBallVel = mulv(4, normalize([-1, -1]));
          pingPongColPlayer = true;
          pingPongColOp = false;
          pingPongOpTimer = 0;
          pingPongOpInput = false;
        };

        if (pingPongStarted) {
          if (getKey("Space")) {
            pingPongPaddlePlayer -= 10 * delta;
          } else {
            pingPongPaddlePlayer += 10 * delta;
          }
          if (pingPongPaddlePlayer > 10 - pingPongPaddleSize)
            pingPongPaddlePlayer = 10 - pingPongPaddleSize;
          if (pingPongPaddlePlayer < 0) pingPongPaddlePlayer = 0;

          pingPongBallPos[0] += pingPongBallVel[0] * delta;
          pingPongBallPos[1] += pingPongBallVel[1] * delta;

          pingPongBallVel[0] += (Math.sign(pingPongBallVel[0]) * delta) / 15;
          pingPongBallVel[1] += (Math.sign(pingPongBallVel[1]) * delta) / 15;

          const ballSize = pxToPingPong([20 * scale, 20 * scale]);
          if (pingPongBallPos[1] <= 0) {
            // reflect over +y
            pingPongBallVel = reflect(pingPongBallVel, [0, 1]);
          }

          if (pingPongBallPos[1] >= 10 - ballSize[1]) {
            // reflect over -y
            pingPongBallVel = reflect(pingPongBallVel, [0, -1]);
          }

          if (pingPongBallPos[0] <= 0) {
            // reflect over +x
            pingPongBallVel = reflect(pingPongBallVel, [1, 0]);
            pingPongScore += 5;
            if (pingPongScore > pingPongHighScore) {
              pingPongHighScore = pingPongScore;
              localStorage.setItem(
                "_compdog_inc_singlebuttongames_pingpong_highscore",
                pingPongHighScore
              );
            }
            reset();
          }

          if (pingPongBallPos[0] >= 10 - ballSize[0]) {
            // reflect over -x
            pingPongBallVel = reflect(pingPongBallVel, [-1, 0]);
            reset();
          }

          // reflect over player paddle
          if (
            collideAABB(
              {
                x1: 10 - pxToPingPong([40 * scale, 0])[0],
                y1: pingPongPaddlePlayer,
                x2: 10,
                y2: pingPongPaddlePlayer + pingPongPaddleSize
              },
              {
                x1: pingPongBallPos[0],
                y1: pingPongBallPos[1],
                x2: pingPongBallPos[0] + ballSize[0],
                y2: pingPongBallPos[1] + ballSize[1]
              }
            )
          ) {
            if (!pingPongColPlayer) {
              pingPongColPlayer = true;
              pingPongScore++;
              if (pingPongScore > pingPongHighScore) {
                pingPongHighScore = pingPongScore;
                localStorage.setItem(
                  "_compdog_inc_singlebuttongames_pingpong_highscore",
                  pingPongHighScore
                );
              }
              pingPongBallVel = reflect(pingPongBallVel, [-1, 0]);
            }
          } else {
            pingPongColPlayer = false;
          }

          // reflect over op paddle
          if (
            collideAABB(
              {
                x1: 0,
                y1: pingPongPaddleOp,
                x2: pxToPingPong([40 * scale, 0])[0],
                y2: pingPongPaddleOp + pingPongPaddleSize
              },
              {
                x1: pingPongBallPos[0],
                y1: pingPongBallPos[1],
                x2: pingPongBallPos[0] + ballSize[0],
                y2: pingPongBallPos[1] + ballSize[1]
              }
            )
          ) {
            if (!pingPongColOp) {
              pingPongColOp = true;
              pingPongBallVel = reflect(pingPongBallVel, [1, 0]);
            }
          } else {
            pingPongColOp = false;
          }

          // simulate ball hit
          let simX = pingPongBallPos[0];
          let simY = pingPongBallPos[1];
          const simDelta = 0.01;
          while (pingPongBallVel[0] > 0 ? simX < 10 - ballSize[0] : simX > 0) {
            simX += (Math.random() * 2 - 1 + pingPongBallVel[0]) * simDelta;
            simY += (Math.random() * 2 - 1 + pingPongBallVel[1]) * simDelta;
          }

          const targetOp = simY - pingPongPaddleSize / 2 + ballSize[1] / 2;
          pingPongOpTimer -= delta;
          if (pingPongOpTimer < 0) pingPongOpTimer = 0;
          if (pingPongOpTimer <= 0) {
            pingPongOpTimer = 0.1;
            pingPongOpInput = targetOp < pingPongPaddleOp;
          }
          if (pingPongOpInput) {
            pingPongPaddleOp -= 10 * delta;
          } else {
            pingPongPaddleOp += 10 * delta;
          }

          if (pingPongPaddleOp > 10 - pingPongPaddleSize)
            pingPongPaddleOp = 10 - pingPongPaddleSize;
          if (pingPongPaddleOp < 0) pingPongPaddleOp = 0;
        } else {
          if (getKeyDown("Space")) {
            buttonPressTimer = 0;
            buttonHeldDown = false;
          } else if (getKey("Space") && !buttonHeldDown) {
            buttonPressTimer += delta;
            if (buttonPressTimer >= 1) {
              buttonHeldDown = true;
              buttonPressTimer = 0;
              if (selectedGameButton === 0) {
                pingPongStarted = true;
              } else if (selectedGameButton === 1) {
                returnToMenu();
              }
              selectedGameButton = -1;
            }
          } else if (getKeyUp("Space") && !buttonHeldDown) {
            buttonPressTimer = 0;
            selectedGameButton++;
            if (selectedGameButton >= 2) selectedGameButton = 0;
          } else {
            buttonPressTimer = 0;
          }
        }
        if (selectedGameButton === 0) restartGameButtonTargetShadow = 20;
        else restartGameButtonTargetShadow = 0;

        if (selectedGameButton === 1) menuGameButtonTargetShadow = 20;
        else menuGameButtonTargetShadow = 0;

        restartGameButtonShadow +=
          (restartGameButtonTargetShadow - restartGameButtonShadow) *
          delta *
          12;

        menuGameButtonShadow +=
          (menuGameButtonTargetShadow - menuGameButtonShadow) * delta * 12;
      }
      break;
  }

  currentOverlay += (targetOverlay - currentOverlay) * delta * 8;
  if (Math.abs(currentOverlay - targetOverlay) < 1) {
    currentOverlay = targetOverlay;
  }
};

const render = (time) => {
  const delta = (time - prevTime) / 1000.0;
  prevTime = time;

  deltaE += (delta - deltaE) / 3.0;
  let deltaDelta = targetDelta - deltaE;

  sc += (deltaDelta * 1.3) / 3;
  if (Math.abs(deltaDelta) < 0.002) {
    sc += 0.0005; // prevent low-resolution locking
  }
  sc = Math.max(1 / Math.min(cv.offsetWidth, cv.offsetHeight), sc);

  if (scale != null) {
    updateScale(0.5);
  }

  updateGame(Math.min(0.3, delta));
  prevKeys = new Map(keys);
  prevButtonBits = buttonBits;

  clearBuffers();

  switch (currentGame) {
    case GAME_MENU:
      {
        for (let i = 0; i < menuCards.length; ++i) {
          drawGameCard(
            menuCards[i],
            i === selectedCard ? buttonPressTimer / 1.0 : 0
          );
        }

        drawBlendedText(
          "Hold button to choose.",
          (25 * scale).toFixed(),
          "Helvetica",
          "#888",
          50 * scale,
          50 * scale,
          0
        );
      }
      break;
    case GAME_FLAPPYBIRD:
      {
        const sx =
          cv.offsetWidth / 4 +
          (flappyBirdPosition[0] / 10) * ((3 * cv.offsetWidth) / 4);
        const sy =
          cv.offsetHeight / 2 -
          (flappyBirdPosition[1] / 5) * (cv.offsetHeight / 2);
        const sx2 =
          cv.offsetWidth / 4 +
          ((flappyBirdPosition[0] + birdWr) / 10) * ((3 * cv.offsetWidth) / 4);
        const sy2 =
          cv.offsetHeight / 2 -
          ((flappyBirdPosition[1] + birdHr) / 5) * (cv.offsetHeight / 2);
        const bw = sx2 - sx;
        const bh = sy - sy2;
        const originX = cv.offsetWidth / 4 + flappyBirdPosition[0];
        const originY =
          cv.offsetHeight / 2 -
          (flappyBirdPosition[1] / 5) * (cv.offsetHeight / 2);

        const fillColor1 = [5, 7, 54, 255];
        const fillColor2 = [105, 14, 17, 255];
        const fillAlpha = Math.max(
          0,
          Math.min(1, (-flappyBirdVelocity[1] - 5) / 5)
        );

        const birdScale =
          (1 -
            Math.max(
              0,
              Math.min(0.09, ((-flappyBirdVelocity[1] - 5) / 5) * 0.09)
            )) *
          1.2;

        for (const coin of flappyBirdCoins) {
          const x1 =
            cv.offsetWidth / 4 + (coin.x / 10) * ((3 * cv.offsetWidth) / 4);
          const y1 = cv.offsetHeight / 2 - (coin.y / 5) * (cv.offsetHeight / 2);

          const x2 =
            cv.offsetWidth / 4 +
            ((coin.x + coin.w) / 10) * ((3 * cv.offsetWidth) / 4);
          const y2 =
            cv.offsetHeight / 2 -
            ((coin.y + coin.h) / 5) * (cv.offsetHeight / 2);

          const w = x2 - x1;
          const h = y1 - y2;

          drawRectangle(
            Math.round(x1 * scale),
            Math.round(y1 * scale),
            Math.ceil(w * scale),
            Math.ceil(h * scale),
            Math.ceil(3 * scale),
            [251, 255, 38, 255],
            [63, 64, 17, 255]
          );
        }

        for (const obst of flappyBirdObstacles) {
          const x1 =
            cv.offsetWidth / 4 + (obst.x / 10) * ((3 * cv.offsetWidth) / 4);
          const y1 = cv.offsetHeight / 2 - (obst.y / 5) * (cv.offsetHeight / 2);

          const x2 =
            cv.offsetWidth / 4 +
            ((obst.x + obst.w) / 10) * ((3 * cv.offsetWidth) / 4);
          const y2 =
            cv.offsetHeight / 2 -
            ((obst.y + obst.h) / 5) * (cv.offsetHeight / 2);

          const w = x2 - x1;
          const h = y1 - y2;

          drawRectangle(
            Math.round(x1 * scale),
            Math.round(y2 * scale),
            Math.ceil(w * scale),
            Math.ceil(h * scale),
            Math.ceil(3 * scale),
            [163, 51, 212, 255],
            [71, 16, 68, 255]
          );

          drawFastShadow(
            Math.round(x1 * scale),
            Math.round(y2 * scale),
            Math.ceil(w * scale),
            Math.ceil(h * scale),
            Math.ceil(30 * scale),
            [163, 51, 212, 255],
            [163, 51, 212, 0]
          );
        }

        if (flappyBirdStarted) {
          drawRectangle(
            Math.round(((sx - originX) * birdScale + originX) * scale),
            Math.round(((sy - originY) * birdScale + originY) * scale),
            Math.ceil(bw * birdScale * scale),
            Math.ceil(bh * birdScale * scale),
            Math.ceil(3 * birdScale * scale),
            [236, 66, 245, 255],
            [
              fillColor2[0] * fillAlpha + fillColor1[0] * (1 - fillAlpha),
              fillColor2[1] * fillAlpha + fillColor1[1] * (1 - fillAlpha),
              fillColor2[2] * fillAlpha + fillColor1[2] * (1 - fillAlpha),
              fillColor2[3] * fillAlpha + fillColor1[3] * (1 - fillAlpha)
            ]
          );

          drawBlendedText(
            "Score: " + flappyBirdScore,
            (24 * scale).toFixed(),
            "Helvetica",
            "#fff",
            Math.ceil(10 * scale),
            Math.ceil(10 * scale)
          );
        } else {
          drawBlendedText(
            "Flappy Bird",
            (48 * scale).toFixed(),
            "Helvetica",
            "#fff",
            Swidth / 2,
            Sheight / 2 - 48 * scale,
            1
          );
          drawBlendedText(
            "High Score: " + flappyBirdHighScore,
            (30 * scale).toFixed(),
            "Helvetica",
            "#eee",
            Swidth / 2,
            Sheight / 2,
            1
          );
          drawBlendedText(
            "Hold button to choose.",
            (25 * scale).toFixed(),
            "Helvetica",
            "#888",
            Swidth / 2,
            Sheight / 2 + 180 * scale,
            1
          );
          {
            // restart button
            const buttonSize = 80 * scale;
            const buttonX = Swidth / 2 - buttonSize / 2 - 80 * scale;
            const buttonY = Sheight / 2 - buttonSize / 2 + 78 * scale;
            const buttonActX = Math.floor(
              Swidth / 2 - (110 * scale) / 2 - 80 * scale
            );
            const buttonActY = Math.floor(
              Sheight / 2 - (110 * scale) / 2 + 78 * scale
            );
            const buttonActS = Math.floor(110 * scale);

            const borderWidth = Math.ceil(4 * scale);
            drawRectangle(
              buttonActX,
              buttonActY,
              buttonActS,
              buttonActS,
              borderWidth,
              [236, 66, 245, 255],
              [0, 0, 0, 0]
            );
            StretchBlt(
              ctdata,
              Math.floor(buttonX),
              Math.floor(buttonY),
              Math.floor(buttonSize),
              Math.floor(buttonSize),
              BMP_RESTART_ICON,
              0,
              0,
              BMP_RESTART_ICON.width,
              BMP_RESTART_ICON.height,
              SRCBLEND
            );

            const playKeyBarHeight = Math.ceil(5 * scale);
            drawRectangle(
              buttonActX + borderWidth,
              buttonActY + buttonActS - playKeyBarHeight - borderWidth,
              Math.round(
                (0 === selectedGameButton ? buttonPressTimer / 1.0 : 0) *
                  (buttonActS - borderWidth * 2)
              ),
              playKeyBarHeight,
              0,
              [],
              [94, 63, 181, 255]
            );

            if (restartGameButtonShadow > 0) {
              drawFastShadow(
                buttonActX,
                buttonActY,
                buttonActS,
                buttonActS,
                Math.ceil(restartGameButtonShadow * scale),
                [236, 66, 245, 255],
                [236, 66, 245, 0]
              );
            }
          }
          {
            // menu button
            const buttonSize = 80 * scale;

            const buttonActX = Math.floor(
              Swidth / 2 - (110 * scale) / 2 + 80 * scale
            );
            const buttonActY = Math.floor(
              Sheight / 2 - (110 * scale) / 2 + 78 * scale
            );
            const buttonActS = Math.floor(110 * scale);

            const buttonX = Swidth / 2 - buttonSize / 2 + 80 * scale;
            const buttonY = Sheight / 2 - buttonSize / 2 + 78 * scale;
            const borderWidth = Math.ceil(4 * scale);
            drawRectangle(
              buttonActX,
              buttonActY,
              buttonActS,
              buttonActS,
              borderWidth,
              [236, 66, 245, 255],
              [0, 0, 0, 0]
            );

            const playKeyBarHeight = Math.ceil(5 * scale);
            drawRectangle(
              buttonActX + borderWidth,
              buttonActY + buttonActS - playKeyBarHeight - borderWidth,
              Math.round(
                (1 === selectedGameButton ? buttonPressTimer / 1.0 : 0) *
                  (buttonActS - borderWidth * 2)
              ),
              playKeyBarHeight,
              0,
              [],
              [94, 63, 181, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(24 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(47 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(70 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            if (menuGameButtonShadow > 0) {
              drawFastShadow(
                buttonActX,
                buttonActY,
                buttonActS,
                buttonActS,
                Math.ceil(menuGameButtonShadow * scale),
                [236, 66, 245, 255],
                [236, 66, 245, 0]
              );
            }
          }
        }
      }
      break;
    case GAME_CIRCLEFLIP:
      {
        if (circleFlipStarted) {
          // draw lights
          const centerX = Swidth / 2;
          const centerY = Sheight / 2;
          const radius = 250 * scale;
          for (let i = 0; i < circleFlipLightCount; ++i) {
            const rad = (i / circleFlipLightCount) * Math.PI * 2;
            const lx = Math.cos(rad) * radius + centerX;
            const ly = Math.sin(rad) * radius + centerY;
            const ledSize = 30 * scale;
            const rx = Math.round(lx - ledSize / 2);
            const ry = Math.round(ly - ledSize / 2);
            drawRectangle(
              rx,
              ry,
              Math.ceil(ledSize),
              Math.ceil(ledSize),
              Math.ceil(3 * scale),
              [84, 30, 87, 255],
              i === circleFlipCurrentLight
                ? [236, 66, 245, 255]
                : i === circleFlipTargetLight
                ? [82, 63, 224, 255]
                : [37, 17, 38, 255]
            );
            if (i === circleFlipTargetLight) {
              drawFastShadow(
                rx,
                ry,
                Math.ceil(ledSize),
                Math.ceil(ledSize),
                Math.ceil(20 * scale),
                [82, 63, 224, 255],
                [82, 63, 224, 0]
              );
            }
          }

          const barrierRad =
            (circleFlipBarrierIndex / circleFlipLightCount) * Math.PI * 2;
          const barrierX = Math.cos(barrierRad) * radius + centerX;
          const barrierY = Math.sin(barrierRad) * radius + centerY;
          drawLine(
            Math.round(centerX),
            Math.round(centerY),
            Math.round(barrierX),
            Math.round(barrierY),
            Math.ceil(10 * scale),
            [201, 107, 207, 180]
          );

          drawBlendedText(
            Math.ceil(circleFlipTimeLeft).toFixed(),
            (24 * scale).toFixed(),
            "Helvetica",
            "#fff",
            centerX,
            centerY,
            1
          );

          drawBlendedText(
            "Score: " + circleFlipScore,
            (24 * scale).toFixed(),
            "Helvetica",
            "#fff",
            Math.ceil(10 * scale),
            Math.ceil(10 * scale)
          );
        } else {
          drawFastShadow(
            Math.round(10 * scale),
            Math.round(10 * scale),
            Math.ceil(590 * scale),
            Math.ceil(75 * scale),
            Math.ceil(100 * scale),
            [82, 63, 224, 255],
            [82, 63, 224, 0]
          );
          drawBlendedText(
            "How to play: You have 60 seconds. Press the button when your",
            (20 * scale).toFixed(),
            "Helvetica",
            "#fff",
            15 * scale,
            15 * scale,
            0
          );
          drawBlendedText(
            "purple light is over the blue target. Each press sets a",
            (20 * scale).toFixed(),
            "Helvetica",
            "#fff",
            15 * scale,
            35 * scale,
            0
          );
          drawBlendedText(
            "new target and flips the direction.",
            (20 * scale).toFixed(),
            "Helvetica",
            "#fff",
            15 * scale,
            55 * scale,
            0
          );
          drawBlendedText(
            "Circle Flip",
            (48 * scale).toFixed(),
            "Helvetica",
            "#fff",
            Swidth / 2,
            Sheight / 2 - 48 * scale,
            1
          );
          drawBlendedText(
            "High Score: " + circleFlipHighScore,
            (30 * scale).toFixed(),
            "Helvetica",
            "#eee",
            Swidth / 2,
            Sheight / 2,
            1
          );
          drawBlendedText(
            "Hold button to choose.",
            (25 * scale).toFixed(),
            "Helvetica",
            "#888",
            Swidth / 2,
            Sheight / 2 + 180 * scale,
            1
          );
          {
            // restart button
            const buttonSize = 80 * scale;
            const buttonX = Swidth / 2 - buttonSize / 2 - 80 * scale;
            const buttonY = Sheight / 2 - buttonSize / 2 + 78 * scale;
            const buttonActX = Math.floor(
              Swidth / 2 - (110 * scale) / 2 - 80 * scale
            );
            const buttonActY = Math.floor(
              Sheight / 2 - (110 * scale) / 2 + 78 * scale
            );
            const buttonActS = Math.floor(110 * scale);

            const borderWidth = Math.ceil(4 * scale);
            drawRectangle(
              buttonActX,
              buttonActY,
              buttonActS,
              buttonActS,
              borderWidth,
              [236, 66, 245, 255],
              [0, 0, 0, 0]
            );
            StretchBlt(
              ctdata,
              Math.floor(buttonX),
              Math.floor(buttonY),
              Math.floor(buttonSize),
              Math.floor(buttonSize),
              BMP_RESTART_ICON,
              0,
              0,
              BMP_RESTART_ICON.width,
              BMP_RESTART_ICON.height,
              SRCBLEND
            );

            const playKeyBarHeight = Math.ceil(5 * scale);
            drawRectangle(
              buttonActX + borderWidth,
              buttonActY + buttonActS - playKeyBarHeight - borderWidth,
              Math.round(
                (0 === selectedGameButton ? buttonPressTimer / 1.0 : 0) *
                  (buttonActS - borderWidth * 2)
              ),
              playKeyBarHeight,
              0,
              [],
              [94, 63, 181, 255]
            );

            if (restartGameButtonShadow > 0) {
              drawFastShadow(
                buttonActX,
                buttonActY,
                buttonActS,
                buttonActS,
                Math.ceil(restartGameButtonShadow * scale),
                [236, 66, 245, 255],
                [236, 66, 245, 0]
              );
            }
          }
          {
            // menu button
            const buttonSize = 80 * scale;

            const buttonActX = Math.floor(
              Swidth / 2 - (110 * scale) / 2 + 80 * scale
            );
            const buttonActY = Math.floor(
              Sheight / 2 - (110 * scale) / 2 + 78 * scale
            );
            const buttonActS = Math.floor(110 * scale);

            const buttonX = Swidth / 2 - buttonSize / 2 + 80 * scale;
            const buttonY = Sheight / 2 - buttonSize / 2 + 78 * scale;
            const borderWidth = Math.ceil(4 * scale);
            drawRectangle(
              buttonActX,
              buttonActY,
              buttonActS,
              buttonActS,
              borderWidth,
              [236, 66, 245, 255],
              [0, 0, 0, 0]
            );

            const playKeyBarHeight = Math.ceil(5 * scale);
            drawRectangle(
              buttonActX + borderWidth,
              buttonActY + buttonActS - playKeyBarHeight - borderWidth,
              Math.round(
                (1 === selectedGameButton ? buttonPressTimer / 1.0 : 0) *
                  (buttonActS - borderWidth * 2)
              ),
              playKeyBarHeight,
              0,
              [],
              [94, 63, 181, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(24 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(47 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(70 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            if (menuGameButtonShadow > 0) {
              drawFastShadow(
                buttonActX,
                buttonActY,
                buttonActS,
                buttonActS,
                Math.ceil(menuGameButtonShadow * scale),
                [236, 66, 245, 255],
                [236, 66, 245, 0]
              );
            }
          }
        }
      }
      break;
    case GAME_PINGPONG:
      {
        if (pingPongStarted) {
          // draw ball
          const ballXNorm = pingPongBallPos[0] / 10.0;
          const ballYNorm = pingPongBallPos[1] / 10.0;
          const ballSizePx = 20 * scale;
          drawRectangle(
            Math.round(ballXNorm * cv.width),
            Math.round(ballYNorm * cv.height),
            Math.ceil(ballSizePx),
            Math.ceil(ballSizePx),
            Math.ceil(3 * scale),
            [251, 255, 38, 255],
            [63, 64, 17, 255]
          );

          // draw paddles
          const paddleOpNorm = pingPongPaddleOp / 10.0;
          const paddleSizeNorm = pingPongPaddleSize / 10.0;
          const paddleSizePx = paddleSizeNorm * cv.height;
          drawRectangle(
            0,
            Math.round(paddleOpNorm * cv.height),
            Math.ceil(40 * scale),
            Math.round(paddleSizePx),
            Math.ceil(3 * scale),
            [163 / 2, 51 / 2, 212 / 2, 255],
            [71 / 2, 16 / 2, 68 / 2, 255]
          );

          const paddlePlayerNorm = pingPongPaddlePlayer / 10.0;
          drawRectangle(
            Math.round(cv.width - 40 * scale),
            Math.round(paddlePlayerNorm * cv.height),
            Math.ceil(40 * scale),
            Math.round(paddleSizePx),
            Math.ceil(3 * scale),
            [163, 51, 212, 255],
            [71, 16, 68, 255]
          );

          drawBlendedText(
            "Score: " + pingPongScore,
            (24 * scale).toFixed(),
            "Helvetica",
            "#fff",
            Math.ceil(10 * scale),
            Math.ceil(10 * scale)
          );
        } else {
          drawBlendedText(
            "Ping Pong",
            (48 * scale).toFixed(),
            "Helvetica",
            "#fff",
            Swidth / 2,
            Sheight / 2 - 48 * scale,
            1
          );
          drawBlendedText(
            "High Score: " + pingPongHighScore,
            (30 * scale).toFixed(),
            "Helvetica",
            "#eee",
            Swidth / 2,
            Sheight / 2,
            1
          );
          drawBlendedText(
            "Hold button to choose.",
            (25 * scale).toFixed(),
            "Helvetica",
            "#888",
            Swidth / 2,
            Sheight / 2 + 180 * scale,
            1
          );
          {
            // restart button
            const buttonSize = 80 * scale;
            const buttonX = Swidth / 2 - buttonSize / 2 - 80 * scale;
            const buttonY = Sheight / 2 - buttonSize / 2 + 78 * scale;
            const buttonActX = Math.floor(
              Swidth / 2 - (110 * scale) / 2 - 80 * scale
            );
            const buttonActY = Math.floor(
              Sheight / 2 - (110 * scale) / 2 + 78 * scale
            );
            const buttonActS = Math.floor(110 * scale);

            const borderWidth = Math.ceil(4 * scale);
            drawRectangle(
              buttonActX,
              buttonActY,
              buttonActS,
              buttonActS,
              borderWidth,
              [236, 66, 245, 255],
              [0, 0, 0, 0]
            );
            StretchBlt(
              ctdata,
              Math.floor(buttonX),
              Math.floor(buttonY),
              Math.floor(buttonSize),
              Math.floor(buttonSize),
              BMP_RESTART_ICON,
              0,
              0,
              BMP_RESTART_ICON.width,
              BMP_RESTART_ICON.height,
              SRCBLEND
            );

            const playKeyBarHeight = Math.ceil(5 * scale);
            drawRectangle(
              buttonActX + borderWidth,
              buttonActY + buttonActS - playKeyBarHeight - borderWidth,
              Math.round(
                (0 === selectedGameButton ? buttonPressTimer / 1.0 : 0) *
                  (buttonActS - borderWidth * 2)
              ),
              playKeyBarHeight,
              0,
              [],
              [94, 63, 181, 255]
            );

            if (restartGameButtonShadow > 0) {
              drawFastShadow(
                buttonActX,
                buttonActY,
                buttonActS,
                buttonActS,
                Math.ceil(restartGameButtonShadow * scale),
                [236, 66, 245, 255],
                [236, 66, 245, 0]
              );
            }
          }
          {
            // menu button
            const buttonSize = 80 * scale;

            const buttonActX = Math.floor(
              Swidth / 2 - (110 * scale) / 2 + 80 * scale
            );
            const buttonActY = Math.floor(
              Sheight / 2 - (110 * scale) / 2 + 78 * scale
            );
            const buttonActS = Math.floor(110 * scale);

            const buttonX = Swidth / 2 - buttonSize / 2 + 80 * scale;
            const buttonY = Sheight / 2 - buttonSize / 2 + 78 * scale;
            const borderWidth = Math.ceil(4 * scale);
            drawRectangle(
              buttonActX,
              buttonActY,
              buttonActS,
              buttonActS,
              borderWidth,
              [236, 66, 245, 255],
              [0, 0, 0, 0]
            );

            const playKeyBarHeight = Math.ceil(5 * scale);
            drawRectangle(
              buttonActX + borderWidth,
              buttonActY + buttonActS - playKeyBarHeight - borderWidth,
              Math.round(
                (1 === selectedGameButton ? buttonPressTimer / 1.0 : 0) *
                  (buttonActS - borderWidth * 2)
              ),
              playKeyBarHeight,
              0,
              [],
              [94, 63, 181, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(24 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(47 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            drawRectangle(
              buttonActX + Math.round(20 * scale),
              buttonActY + Math.round(70 * scale),
              buttonActS - Math.round(40 * scale),
              Math.round(15 * scale),
              0,
              [],
              [236, 66, 245, 255]
            );

            if (menuGameButtonShadow > 0) {
              drawFastShadow(
                buttonActX,
                buttonActY,
                buttonActS,
                buttonActS,
                Math.ceil(menuGameButtonShadow * scale),
                [236, 66, 245, 255],
                [236, 66, 245, 0]
              );
            }
          }
        }
      }
      break;
  }

  ctx.putImageData(ctdata, 0, 0);

  ctx.fillStyle = "rgba(0,0,0," + currentOverlay + "%)";
  ctx.fillRect(0, 0, Swidth, Sheight);

  requestAnimationFrame(render);
};

requestAnimationFrame(render);
