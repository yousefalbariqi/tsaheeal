Tasaheel Alumrah — Brand Identity Reference


For developers implementing the visual identity on web/app




1. Brand Overview

Brand name: Tasaheel Alumrah / تساهيل العمرة
Industry: Umrah travel services
Positioning: Modern, professional Umrah facilitation company — bridging the sacred destination with seamless digital service.


2. Logo

Concept


The Arabic word "تساهيل" written in square Kufic script — the letters themselves form the shape of the Kaaba.
3D corner (isometric) perspective — as if viewing the Kaaba from a front-corner angle.
The gold band at the top directly references the Kiswa golden stripe.
Bottom horizontal line represents a safe, steady journey.


Logo Mark Rules

RuleDetailMinimum sizeDo not shrink below 24px height (icon contexts)Clear spaceMaintain padding equal to the height of the "ت" letter around all sidesOn dark bgUse full logo (black body + gold band)On light bgUse full logo or monochrome black versionOn gold bgUse white/cream monochrome versionNeverStretch, recolor, add drop shadows, outline, or place on busy backgrounds

Logo Variants


Primary — Black body + gold band + Arabic/English wordmark
Horizontal — Logo mark left, wordmark right
Stacked — Logo mark top, wordmark below
Monochrome black — For embroidery, laser engraving, official stamps
Monochrome white — For dark/metal surfaces
Icon only — For app icons, favicons (min 24px)



3. Color Palette

css:root {
  /* Primary */
  --color-black:   #12100f;   /* Main brand black — logo body, backgrounds */
  --color-gold:    #c0862c;   /* Gold — Kiswa stripe, accents, CTAs */
  --color-cream:   #fafbe6;   /* Off-white — text on dark, light backgrounds */

  /* Usage aliases */
  --color-bg-dark:     #12100f;
  --color-bg-light:    #fafbe6;
  --color-accent:      #c0862c;
  --color-text-light:  #fafbe6;
  --color-text-dark:   #12100f;
}

Color Usage Rules

ContextBackgroundTextAccentDark theme#12100f#fafbe6#c0862cLight theme#fafbe6#12100f#c0862cCTA button#c0862c#12100f—Card on dark#1a1714#fafbe6#c0862cGold section#c0862c#12100f—


⚠️ Never use pure #000000 or #ffffff — always use #12100f and #fafbe6.




4. Typography

Typeface

DIN Next LT — primary typeface for both Arabic and Latin.

css/* Import or license DIN Next LT */
font-family: 'DIN Next LT Arabic', 'DIN Next LT', sans-serif;

Type Scale

css:root {
  --text-xs:   12px;
  --text-sm:   14px;
  --text-base: 16px;
  --text-md:   18px;
  --text-lg:   22px;
  --text-xl:   28px;
  --text-2xl:  36px;
  --text-3xl:  48px;

  --weight-regular: 400;
  --weight-medium:  500;
  --weight-bold:    700;

  --line-height-tight:  1.3;
  --line-height-normal: 1.6;
  --line-height-loose:  1.8;  /* Arabic body text */
}

Arabic-Specific Rules


Direction: dir="rtl", text-align: right
Line height: Minimum 1.8 for Arabic body text (letters need vertical breathing room)
Letter spacing: letter-spacing: 0 for Arabic (never add tracking to Arabic text)
Font size: Arabic renders slightly smaller optically — bump up 1 size vs Latin equivalent



5. Spacing & Layout

css:root {
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  40px;
  --space-2xl: 64px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --container-max: 1200px;
  --container-pad: 24px;  /* mobile: 16px */
}


6. UI Components

Buttons

css/* Primary CTA */
.btn-primary {
  background: #c0862c;
  color: #12100f;
  font-family: 'DIN Next LT Arabic', sans-serif;
  font-weight: 700;
  font-size: 16px;
  padding: 12px 28px;
  border-radius: 8px;
  border: none;
}

/* Secondary */
.btn-secondary {
  background: transparent;
  color: #c0862c;
  border: 1.5px solid #c0862c;
  padding: 12px 28px;
  border-radius: 8px;
}

/* Ghost (on dark) */
.btn-ghost {
  background: transparent;
  color: #fafbe6;
  border: 1px solid rgba(250, 251, 230, 0.3);
  padding: 12px 28px;
  border-radius: 8px;
}

Cards

css.card {
  background: #1a1714;          /* slightly lighter than bg */
  border: 0.5px solid rgba(192, 134, 44, 0.25);  /* subtle gold border */
  border-radius: 12px;
  padding: 24px;
}

.card-accent {
  border-left: 3px solid #c0862c;  /* LTR */
  /* border-right: 3px solid #c0862c; for RTL */
}


7. Iconography


Style: outline icons (not filled)
Weight: match the brand's geometric feel — 1.5–2px stroke
Recommended set: Tabler Icons or Phosphor Icons (outline)
Color: #c0862c for active/highlighted, #fafbe6 at 60% opacity for inactive



8. Imagery Guidelines


Photography: Mecca, Madinah, pilgrims — warm golden tones, dawn/dusk lighting
Overlays: Dark overlay (#12100f at 60–70%) on hero images to maintain text readability
Avoid: Generic stock travel photos, blue-tinted images, cold color temperatures
Preferred: Aerial/architectural shots of Masjid al-Haram with golden hour light



9. Voice & Tone (UI copy)

ContextToneHeadlinesDignified, warm, confidentCTA buttonsDirect action: "Book Now", "احجز الآن"Error messagesCalm, helpful, never alarmingSuccess statesWarm, reassuringEmpty statesInviting, action-oriented


Sentence case always (not ALL CAPS in UI)
Bilingual: Arabic primary, English secondary
Never use generic travel clichés ("journey of a lifetime", etc.)