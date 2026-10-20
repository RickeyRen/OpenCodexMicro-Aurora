# Key display design references

The 196 px Deck Dock keys receive native GIF, PNG, and SVG images from Studio.
React/WebGL components cannot be installed into this image protocol directly.
The key artwork in `plugin/design-variants.js` and `plugin/premium-art.js` is independently drawn SVG, rendered
into small looping GIFs during the build. No third-party component code is
included in this renderer.

Useful open-source references:

- [ElevenLabs UI Orb](https://github.com/elevenlabs/ui/blob/main/apps/www/registry/elevenlabs-ui/ui/orb.tsx): volumetric liquid color, state-driven motion, React Three Fiber. The project uses the [MIT license](https://github.com/elevenlabs/ui/blob/main/LICENSE.md).
- [Magic UI Border Beam](https://magicui.design/docs/components/border-beam): restrained motion and a single traveling accent, rather than many decorative rings. Its open-source components use the [MIT license](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md); separately sold Pro templates are a different offering.

The shipped Aurora Silk theme uses folded light ribbons, a white short name, and a quiet
stable conversation number. Two lines keep names readable without a scrolling
text marquee. A local per-conversation alias can replace an ambiguous title.
Automatic labels use conversation titles, without project-directory fallbacks;
unnamed conversations show a localized Untitled label with their stable number.
Every conversation in the same state uses the same palette: cyan/blue working,
amber waiting, green complete, red error, dim neutral idle. Colors never encode
conversation identity. The alternative solid-color design is retained in source.

Studio's native text layer has no documented outline switch. A small original
CoreText/ImageIO helper draws the white glyph directly into each animation frame;
`showtext:false` and disabled native Task titles prevent a second outlined copy.
The helper uses system frameworks and fonts, with no extra rendering runtime.
