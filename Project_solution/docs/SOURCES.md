# How Mothlight calculates its numbers

Nobody knows exactly what one AI prompt costs. Mothlight uses the best-known **published** figures,
shows a **range** by default, and always tells you which figure it used. All constants live in
[`src/lib/footprint.ts`](../src/lib/footprint.ts), so changing a number there changes it everywhere.

## Per-prompt figures (one text prompt)

| Figure | Energy | CO₂e | Water | Source |
|---|---|---|---|---|
| Low: chips only | 0.10 Wh | – | – | Google: same median Gemini prompt, counting only the AI accelerators (TPUs) |
| Gemini, median text prompt | 0.24 Wh | 0.03 g | 0.26 mL | Google, *Measuring the environmental impact of delivering AI at Google scale*, Aug 2025, [arXiv 2508.15734](https://arxiv.org/abs/2508.15734) |
| ChatGPT, average query | 0.34 Wh | not given | 0.32 mL | Sam Altman (OpenAI CEO), *The Gentle Singularity*, blog, June 2025 |
| Claude, short prompt (**independent**) | ≈ 0.8 Wh | – | – | Anthropic publishes no figure. Jegham et al., *How Hungry is AI?*, May 2025, [arXiv 2505.09598](https://arxiv.org/abs/2505.09598), Claude 3.7 Sonnet, short prompt (as reported by secondary summaries; check the paper's table before the demo) |

The Gemini and ChatGPT rows are **company figures, not independently checked**. The Claude row is the opposite: an outside study, because Anthropic has published nothing. It's higher partly because outside researchers estimate the whole server's power, not just the chips. That gap is exactly why Mothlight shows ranges.

### The four settings (popup → AI tab → "Per-prompt figure")

- **Range** (default)
  - energy = prompts × 0.10 … 0.34 Wh
  - water = prompts × 0.26 … 0.32 mL
  - CO₂e = energy × grid intensity
  - The width of the range *is* the message: the uncertainty is large.
- **Gemini**
  - energy = prompts × 0.24 Wh
  - CO₂e = prompts × 0.03 g (Google's own number)
  - water = prompts × 0.26 mL
- **ChatGPT**
  - energy = prompts × 0.34 Wh
  - water = prompts × 0.32 mL
  - CO₂e = energy × grid intensity, because OpenAI gives none.
- **Claude**
  - energy = prompts × 0.8 Wh (independent estimate)
  - CO₂e = energy × grid intensity
  - water = the 0.26 … 0.32 mL company range, because there is no Claude figure.

For "real life" comparisons in Range mode we use the middle figure, 0.24 Wh.

## Laptop energy (our own twist)

`laptop Wh = laptop watts × active hours`, and `CO₂e = Wh × grid g/kWh ÷ 1000`.

The default is **15 W**. This is an assumption: typical laptops draw roughly 10–30 W while browsing, depending on the
screen brightness and the device. Users can change it in Settings. Only *active* time counts, which is the same time as the screen-time numbers.

## Electricity grid (g CO₂e per kWh)

| Grid | g/kWh | Source |
|---|---|---|
| EU average | 242 | Ember, *European Electricity Review 2024* (2023 data) |
| Netherlands | 268 | Ember 2023 data (via Statista) |
| Germany | 371 | Ember, *European Electricity Review 2024* (2023 data) |
| Poland | 662 | Ember, *European Electricity Review 2024* (2023 data) |
| France | 50 | rounded: low-carbon grid (mostly nuclear); check Ember's data explorer for the exact value |
| Sweden | 30 | rounded: low-carbon grid (hydro + nuclear); check Ember's data explorer for the exact value |

The grid is used for the laptop's energy, and for AI energy when the company publishes no CO₂e.
AI really runs in data centres whose location we don't know, so for AI this is an approximation and is labelled as one.

## Comparisons

| Comparison | Value | Maths |
|---|---|---|
| Phone charge | 15 Wh | 4000 mAh × 3.85 V ≈ 15.4 Wh, a typical smartphone battery |
| LED bulb | 10 W | minutes = Wh ÷ 10 W × 60 |
| Teaspoon | 5 mL | teaspoons = mL ÷ 5 |

## Not counted (so the real total is higher)

- Long answers, images, file uploads, voice and "deep research". These cost much more than a short text prompt, and we can't tell them apart without reading content, which we refuse to do.
- Training the models, and building data centres and hardware.
- The network between you and the data centre.
- Prompts on sites Mothlight can't detect, unless you add them with **+1**.

## Time tracking rules

- Only the **active tab** of the **focused** browser window counts, and only `http(s)` pages.
- **Idle:** after 60 s without keyboard or mouse input, counting stops, and those 60 s are taken back off.
- **Locked screen:** never counts.
- **Exception:** a tab that is **playing sound** (a lecture video) keeps counting while you're idle.
- **Sleep:** if the laptop sleeps, the gap is not counted (at most one heartbeat, 60 s).
- Time is split at midnight into the right day.
- **Focus sessions:** the study timer is wall-clock time from **Start** to **End**. Within it, every minute is either
  *active on a website* (the same rules as above) or *away*, and the away time keeps the reason the tracker saw:
  another app in front, away from the keyboard (including the 60 s idle minute), screen locked, a browser page
  (new tab, settings) or no heartbeat for over 2.5 min (browser closed or laptop asleep). So sites + away ≈ the whole session.
