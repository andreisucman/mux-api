const criteria = {
  face: {
    elasticity: `0-20 points: Poor Elasticity
The skin lacks firmness and resilience, appearing loose or sagging with minimal rebound when stretched. Fine lines, wrinkles, or creases are prominent, and the skin may appear thin or fragile. There is little to no natural snap-back effect, indicating significant loss of elasticity.

20-40 points: Minimal Elasticity
The skin shows slight resilience but remains below average in firmness. Some mild sagging or laxity is present, particularly in areas prone to stretching (e.g., abdomen, arms, or thighs). The rebound effect is slow, and fine lines or early wrinkling may be noticeable upon manipulation.

40-60 points: Moderate Elasticity
The skin has a balanced level of firmness with moderate resilience. It rebounds reasonably well when lightly stretched but may show slight laxity in high-mobility areas. Minor creasing may occur, but the overall texture appears smooth and supported. Hydration and collagen levels contribute to a healthier bounce-back response.

60-80 points: Good Elasticity
The skin is firm, supple, and highly resilient, with a quick rebound when stretched. Minimal laxity is present, and the surface appears smooth with only subtle fine lines under tension. The skin maintains a youthful tautness, reflecting strong collagen and elastin support.

80-100 points: Excellent Elasticity
The skin exhibits exceptional firmness and snap-back recovery, resembling youthful elasticity. It remains taut, smooth, and resistant to sagging or creasing even when stretched. The texture is plump and hydrated, with no visible laxity or wrinkles. This tier reflects optimal collagen/elastin integrity and outstanding skin health.`,
    texture: `0-20 points: Poor Skin Texture
The skin appears rough, uneven, or heavily textured. Visible blemishes, large pores, acne, or hyperpigmentation are prominent. The surface lacks smoothness and may show signs of dehydration or irritation. Overall, the skin looks dull and unhealthy.

20-40 points: Minimal Skin Refinement
The skin has slight improvements in texture but remains uneven. Some areas may appear smoother, but blemishes, minor acne, or discoloration are still noticeable. Pores are visible, and the skin lacks a consistent glow. Hydration levels are suboptimal.

40-60 points: Moderate Skin Texture
The skin is fairly smooth with minor imperfections. Pores are refined but still somewhat visible in certain lighting. Some areas may have slight discoloration or occasional breakouts, but the overall texture is balanced. A healthy glow is beginning to emerge, and hydration is improved.

60-80 points: Good Skin Texture
The skin appears smooth and well-maintained, with minimal imperfections. Pores are small and barely noticeable. Minor discoloration or rare blemishes may exist but do not detract from the overall clarity. The skin has a natural radiance, good elasticity, and even tone.

80-100 points: Excellent Skin Texture
The skin is exceptionally smooth, clear, and refined. Pores are nearly invisible, and there are no visible blemishes or discoloration. The complexion is even, luminous, and deeply hydrated, with a plump, youthful appearance. The skin looks healthy, radiant, and well-cared-for, reflecting an outstanding skincare routine and overall wellness.`,
    tone: `0-20 points: Poor Skin Tone
The complexion is highly uneven, with prominent discoloration, hyperpigmentation, or redness. Dark spots, melasma, or post-inflammatory marks are widespread. The skin appears patchy, dull, or sallow, with no uniformity in color.

20-40 points: Minimal Tone Evenness
Some improvement in tone, but discoloration (dark spots, redness, or uneven patches) remains obvious. The skin lacks vibrancy, and areas of hyperpigmentation or dullness detract from a balanced appearance.

40-60 points: Moderate Skin Tone
The complexion is moderately even, with minor discoloration or slight redness in certain areas. Hyperpigmentation may be faint but not distracting. The skin has a more uniform base, with a subtle healthy glow starting to emerge.

60-80 points: Good Skin Tone
Skin tone is mostly even and radiant, with minimal discoloration. Any remaining hyperpigmentation or redness is faint and only visible under close inspection. The complexion appears balanced, bright, and naturally healthy.

80-100 points: Excellent Skin Tone
Flawless, even-toned complexion with no visible discoloration, redness, or dark spots. The skin has a luminous, uniform hue—whether fair, medium, or deep—and appears naturally radiant. Melanin distribution is perfectly balanced, reflecting optimal skin health and care.`,
    pores: `0-20 points: Very Enlarged, Prominent Pores
Pores are extremely visible, dilated, and may appear "open" or clogged. They are widespread across the T-zone, cheeks, or nose, often with blackheads or excess sebum. Skin texture appears rough and uneven due to pore prominence.

20-40 points: Enlarged, Noticeable Pores
Pores are clearly visible, especially in oily or combination skin areas. Some may appear stretched or slightly clogged, with minor blackheads. Texture is improved but still uneven under certain lighting.

40-60 points: Moderate Pore Visibility
Pores are visible upon close inspection but not overly distracting. They may appear refined in some areas (e.g., cheeks) but slightly larger in the T-zone. Minimal blackheads or congestion. Skin looks smoother overall.

60-80 points: Refined, Minimal Pores
Pores are small and barely noticeable except under magnification. No visible clogging or blackheads. Skin appears smooth, with pores blending naturally into the complexion.

80-100 points: Nearly Poreless, Flawless Texture
Pores are virtually invisible to the naked eye, even under close inspection. Skin looks airbrushed, with a seamless, smooth surface. No congestion or texture irregularities.`,
    wrinkles: `0-20 points: Poor Skin Smoothness
The skin shows significant wrinkling, with deep folds and pronounced texture. Wrinkles are highly visible even at rest, particularly around high-movement areas (e.g., forehead, eyes, mouth). The skin appears loose, creased, and lacks elasticity, with minimal natural firmness or hydration.

20-40 points: Minimal Skin Smoothness
Wrinkles are noticeable but not severe. Fine lines are present, especially with facial expressions, but deeper wrinkles are less prominent at rest. Skin retains some elasticity but shows early signs of aging or dehydration, with slight sagging in key areas.

40-60 points: Moderate Skin Smoothness
The skin exhibits moderate wrinkles, primarily dynamic (appearing with movement) rather than static. Fine lines are visible up close, but deeper wrinkles are minimal. Skin maintains reasonable firmness and hydration, with minor texture irregularities. Overall appearance is age-appropriate but not overly aged.

60-80 points: Good Skin Smoothness
Wrinkles are subtle and limited to fine lines, mostly visible only with exaggerated expressions. Skin appears smooth at rest, with good elasticity and hydration. Minor texture may exist but is not distracting. The overall look is youthful, with well-maintained collagen and minimal sagging.

80-100 points: Excellent Skin Smoothness
The skin is nearly flawless, with minimal to no visible wrinkles even during expressions. Surface texture is smooth, firm, and evenly toned. Hydration and elasticity are optimal, contributing to a plump, youthful appearance. Any fine lines are barely perceptible, and the skin radiates health and vitality.`,
  },
  hair: {
    density: `0-20 points: Very Thin/Sparse Hair
The scalp is highly visible with significant gaps between hair strands. Hair appears wispy, fragile, and lacks volume. Coverage is minimal, with noticeable bald spots or extreme thinning. The overall appearance is weak and uneven.

20-40 points: Below-Average Density
Hair is thin but slightly more distributed, with moderate scalp visibility. Strands are finer and sparser than average, lacking fullness. Some areas may appear patchy, especially under bright light. Volume is minimal, and styling options are limited.

40-60 points: Moderate Density
Hair has a balanced but unremarkable thickness. The scalp may peek through in certain lighting but isn't overly obvious. Strands have decent coverage, though volume is still average or slightly below. Styling holds better, but hair lacks natural body.

60-80 points: Good/Thick Density
Hair appears full and healthy, with minimal scalp visibility. Strands are densely packed, providing ample volume and texture. Styling is versatile, and hair holds shape well. Minor thinning may occur at the crown or part line but isn't distracting.

80-100 points: Excellent/Luxurious Density
Hair is exceptionally thick, with no visible scalp even under direct light. Strands are densely packed, creating a lush, voluminous appearance. Hair feels heavy, resilient, and effortlessly holds styles. The overall look is vibrant, healthy, and enviably full.`,
    texture: `0-20 points: Poor Texture
The hair appears severely damaged and uneven. Split ends are widespread and highly visible, with frequent white dots and fraying. The surface looks chaotic, with extreme frizz or puffiness disrupting the hair's alignment. Breakage is obvious, with short, uneven pieces sticking out randomly. Some sections may appear wiry while others look limp, creating a patchy overall effect.

20-40 points: Minimal Texture Refinement
The hair shows slight improvement but remains below average in smoothness. Split ends are present but not dominant on every strand. Frizz is noticeable, particularly at the crown and ends, disrupting the hair's flow. Strands lack uniformity, with some areas appearing slightly smoother than others. Minor breakage is detectable upon close inspection.

40-60 points: Moderate Texture
The hair displays a balanced but unremarkable texture. Split ends are minimal and confined mostly to the tips. Frizz is subdued, with only minor flyaways under humidity. Strands align decently but may show slight variations in smoothness. No major breakage is apparent, though finer hairs may lack uniformity.

60-80 points: Good Texture
The hair appears smooth and well-maintained. Split ends are rare and barely noticeable. Frizz is minimal, limited to a few flyaways in harsh conditions. The cuticle layer looks intact, contributing to a sleek appearance. Strands align neatly, with no visible patches of roughness or breakage.

80-100 points: Excellent Texture
The hair exhibits flawless, salon-quality refinement. No split ends or breakage are detectable, even upon close inspection. The surface is perfectly smooth, with zero frizz or flyaways. Strands fall in uniform alignment, creating a seamless, polished look from roots to ends.`,
    shine: `0-20 points: Poor Hair Shine. Hair appears dull, dry, and lifeless with no reflective quality. It lacks luster and may look rough, frizzy, or damaged. Overall appearance is matte and unhealthy.

20-40 points: Minimal Hair Shine. Hair shows slight luster in certain lighting but remains mostly flat and lackluster. Shine is uneven and limited to small areas. Texture may still appear coarse or dry.

40-60 points: Moderate Hair Shine. Hair has a consistent, soft sheen under light. It looks healthier and smoother, with improved texture and light reflection, but shine is not intense or high-gloss.

60-80 points: Good Hair Shine. Hair reflects light clearly and evenly. It appears healthy, smooth, and vibrant with a noticeable gloss. Texture is silky, and shine enhances the overall aesthetic.

80-100 points: Excellent Hair Shine. Hair displays an intense, mirror-like shine with brilliant light reflection. It looks luxuriously healthy, sleek, and polished. Shine is uniform from root to tip, enhancing overall beauty.`,
    scalp: `0-20 points: Poor Scalp Health. Scalp is visibly dry, flaky, or excessively oily. Redness, irritation, or sores may be present. Overall appearance is unhealthy and neglected.

20-40 points: Minimal Scalp Health. Some signs of dryness, oiliness, or buildup are present. Mild flaking or irritation may occur. Scalp lacks balance and vitality.

40-60 points: Moderate Scalp Health. Scalp is mostly clear with occasional dryness or oiliness. Minimal flaking or buildup. Scalp appears relatively healthy with minor issues.

60-80 points: Good Scalp Health. Scalp is clean, balanced, and free from visible irritation or buildup. No signs of flaking or excess oil. Overall appearance is healthy and well-maintained.

80-100 points: Excellent Scalp Health. Scalp is perfectly balanced, smooth, and free from any irritation, buildup, or flaking. Overall appearance is pristine, vibrant, and optimally nourished.`,
  },
};

export default criteria;
