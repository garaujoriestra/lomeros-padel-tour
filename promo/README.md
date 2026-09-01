# Vídeos de marketing (Remotion)

Proyecto [Remotion](https://www.remotion.dev) autocontenido para los vídeos
promocionales de la plataforma. **No forma parte de la app Next**: tiene su
propio `package.json` y está excluido del typecheck/lint raíz.

## Qué hay

- **`Promo`** — promo vertical 1080×1920 (9:16, Reels/TikTok/Shorts), 27 s a
  30 fps, con la estética dark de la app (Barlow Condensed itálica + Archivo,
  acento lima). Cinco escenas: caos de WhatsApp → «Tu peña merece una liga» →
  marcador Pista Central → La Timba/logros/parejas → CTA.

La **marca, el tagline y la URL son props** (el rename de marca está en curso),
con defaults en `src/Promo.tsx` (`Bandejazo` / `bandejazo.app`).

## Uso

```bash
cd promo
npm install

# Editor visual con preview en vivo
npm run studio

# Render final → promo/out/promo.mp4
npm run render

# Con otra marca/URL sin tocar código
npx remotion render Promo out/promo.mp4 \
  --props='{"brand":"Padelo","url":"lomeros-padel-tour.vercel.app/padelo"}'
```

## Notas

- Sin música a propósito (en redes se ve mucho en silencio y evita líos de
  licencias); para añadirla: `<Audio src={staticFile('musica.mp3')} />` en
  `Promo.tsx` con el fichero en `promo/public/`.
- Licencia Remotion: gratis para individuos y empresas de ≤3 personas
  (remotion.dev/license).
- El render usa el Chrome headless que Remotion descarga solo la primera vez.
