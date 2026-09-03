# Motion specification

## Model

- The invitation is a single fixed `100dvh` stage driven by vertical document scroll.
- Eight scenes share the same stage; scrolling changes the scene state instead of vertically moving eight independent pages through the viewport.
- Scene `n` and scene `n+1` overlap during their transition. No hard page cut is allowed.
- Motion must preserve visual causality and hierarchy. Background and foreground should move at different amplitudes; text movement stays restrained.

## Scroll timeline

The full story maps normalized scroll progress `0 → 1` to scene position `0 → 7`.

For each scene:

- enter: previous scene position to its center;
- hold: strongest readability around its center;
- leave: its center to next scene position;
- opacity crossfade: smoothstep by scroll progress to remove abrupt visual acceleration;
- local scene parameter `p`: `0 → 1` across enter/leave and used for internal parallax.

## Motion roles

| Layer | Motion | Recommended amplitude |
| --- | --- | --- |
| Back atmosphere | scale / tiny drift | 0–8 px equivalent |
| Rear florals | parallax | 8–16 px |
| Photo / primary subject | slow scale + vertical settle | scale 0.985–1.0; 0–14 px |
| Front florals | parallax | 18–36 px |
| Curtain | horizontal opening / compression | 8–24% of its own width |
| Text | vertical settle only | 0–22 px |
| Petals | sparse independent drift | 20–45 px |
| Gold shimmer | mask/light sweep | about 3.8 s on the final rule; slow foil texture drift on title/monogram only |

## Scene-specific intent

1. **Cover** — photo is stable; curtains and florals form a quiet frame. Scroll begins with a restrained separation of foreground layers.
2. **Announcement** — cover dissolves into warm paper/halo; petals supply continuity, not spectacle.
3. **Time** — gold ring subtly rotates/settles while date locks in place.
4. **Message** — veil drifts slowly behind text; copy remains the anchor.
5. **Location** — architectural arch resolves from light; florals remain low and frame the address.
6. **Transition** — deep-brown curtains open farther than on cover while the regraded real wedding-stage photograph resolves underneath; flowers retain their red/white/pink color.
7. **Couple** — second photo becomes primary; florals move minimally so identity stays stable.
8. **Invitation** — movement nearly stops. Only restrained gold light and subtle paper depth remain.

## Input and interruption

- Native touch scrolling remains authoritative. Do not trap gestures or force a wheel animation queue.
- The stage must retarget immediately if the user reverses scroll direction.
- Avoid long keyframe animations that need to finish before another state can render.

## Reduced motion

When `prefers-reduced-motion: reduce` is active:

- preserve the eight-scene progression;
- use opacity/state changes rather than spatial parallax;
- disable persistent rotation, dust drift, petal travel, and shimmer loops;
- keep music control behavior unchanged.
