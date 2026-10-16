#!/usr/bin/env python3
"""
make_dark_logo.py - derive a dark-background version of the hub logo.

The original logo (assets/valencia-hub-logo.png) is dark blue and grey on
a transparent background, which is hard to read on the site's dark pages.
This keeps the transparency and shapes, lightens the blue and turns the
grey lettering into the site's light ink colour.

Usage:
    python3 scripts/make_dark_logo.py \\
        assets/valencia-hub-logo.png assets/valencia-hub-logo-dark.png
"""
import sys

from PIL import Image

LIGHT_BLUE = (110, 166, 230)
LIGHT_INK = (232, 227, 218)


def recolour(pixel):
    r, g, b, a = pixel
    if a == 0:
        return pixel
    if b - r > 40:  # the blue ring and "VALENCIA"
        return LIGHT_BLUE + (a,)
    return LIGHT_INK + (a,)  # grey lettering


def main():
    if len(sys.argv) != 3:
        print('usage: make_dark_logo.py <input.png> <output.png>',
              file=sys.stderr)
        sys.exit(1)
    im = Image.open(sys.argv[1]).convert('RGBA')
    im.putdata([recolour(p) for p in im.getdata()])
    im.save(sys.argv[2], optimize=True)


if __name__ == '__main__':
    main()
