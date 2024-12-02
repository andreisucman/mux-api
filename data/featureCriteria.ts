const criteria = {
  female: {
    head: {
      mouth: `
                0-20: Severe oral health issues. This range represents conditions such as advanced periodontal disease with deep gum pockets, multiple missing teeth, extensive decay visible on many teeth, or untreated infections causing visible swelling or bellycesses.
                ##
                20-40: Poor oral health. Individuals in this range might exhibit noticeable dental problems, such as moderate periodontal disease with visible gum recession and bleeding, several untreated cavities, or significant plaque buildup causing teeth discoloration.
                ##
                40-60: Fair oral health. This category could include people with occasional dental issues, such as early signs of gum disease with slight redness and swelling, a few small cavities that might not be immediately noticeable, or occasional gum irritation without severe symptoms.
                ##
                60-80: Good oral health. People in this range typically have few dental issues, such as minimal plaque, healthy pink gums without signs of inflammation, and teeth that are generally free of decay or discoloration beyond minor cosmetic concerns.
                ##
                80-100: Excellent oral health. This represents optimal dental health, including strong and well-maintained teeth, healthy pink gums with no signs of recession or inflammation, and no visible decay or staining.
                `,
      skin: `
                0-20: Severe skin issues, such as extensive acne, cysts, open wounds, or severe burns that heavily compromise skin integrity and appearance.
                ##
                20-40: Significant skin problems, including persistent acne, deep scars, noticeable discoloration, or rough texture that affect overall skin quality and appearance.
                ##
                40-60: Moderate skin concerns, like occasional breakouts, mild pigmentation issues, rough patches, or visible signs of aging (fine lines and wrinkles).
                ##
                60-80: Generally healthy skin with minor imperfections, such as occasional pimples, slight dryness or oiliness, and minimal signs of aging.
                ##
                80-100: Excellent skin health, characterized by smooth texture, even tone, no visible pores, and a radiant appearance. Little to no signs of aging, acne, or other skin issues.
                `,
      lips: `
                0-20: Severe dryness and cracking, visible flaking.
                ##
                20-40: Dry with some cracking, noticeable rough texture.
                ##
                40-60: Moderately dry, occasional cracking, slight roughness.
                ##
                60-80: Generally smooth but slightly dry, minimal cracking if any.
                ##
                80-100: Perfectly smooth and moisturized, no cracking, soft and supple.
                `,
      eyes: `
                0-20: Deep wrinkles, extensive crow's feet, severe under-eye bags or puffiness, prominent dark circles, and very poor skin texture with significant laxity.
                ##
                20-40: Moderate wrinkles around the eyes, noticeable crow's feet, moderate under-eye bags or puffiness, some dark circles, and beginning signs of skin laxity and uneven texture.
                ##
                40-60: Fine lines around the eyes, mild crow's feet, slight under-eye bags or puffiness, mild dark circles that can be improved with treatment, and moderate skin texture issues.
                ##
                60-80: Few or no wrinkles around the eyes, minimal crow's feet, occasional under-eye bags or puffiness that is easily managed, minimal dark circles, and generally smooth and firm skin texture.
                ##
                80-100: No visible wrinkles or lines around the eyes, no crow's feet, no under-eye bags or puffiness, no dark circles, and very smooth, firm, and youthful skin texture.
                `,
      grooming: `
                0-20: Eyebrows are sparse, uneven, and poorly shaped. Stray facial hairs are prominent. Visible nose or ear hair. If makeup exists, it's smudged or poorly applied, with residue visible. Overall appearance is unkempt and lacks attention to detail.
                ##
                20-40: Eyebrows lack definition and symmetry, with some stray hairs and inconsistent shaping. If makeup exists, it's application is uneven, with some smudging or residue. Grooming needs significant improvement.
                ##
                40-60: Eyebrows are reasonably shaped but could benefit from more definition and symmetry. Stray facial hairs are minimal. If makeup exists, it's is adequately applied but could be more precise. Overall grooming is acceptable but not polished.
                ##
                60-80: Eyebrows are well-shaped with good symmetry and minimal stray hairs. If makeup exists, it's neatly applied with minimal smudging or residue, enhancing the overall appearance. Grooming complements facial features and adds to a refined look.
                ##
                80-100: Eyebrows are perfectly shaped, balanced, and symmetrical, with no stray hairs. If makeup exists, it's flawlessly applied, with no smudging or residue, enhancing facial symmetry and overall appearance. Grooming is immaculate, contributing to a polished and well-maintained look.`,
      scalp: `
                0-20: Severe scalp issues, such as extensive dandruff, psoriasis, eczema, open sores, or severe inflammation that significantly disrupt scalp integrity and appearance.
                ##
                20-40: Significant scalp problems, including persistent dandruff, noticeable dryness or oiliness, deep flakes, or moderate inflammation affecting overall scalp quality and appearance.
                ##
                40-60: Moderate scalp appearance concerns, such as occasional flakes or dry patches, slight redness, or minor texture irregularities that mildly affect the visual quality of the scalp.
                ##
                60-80: Generally healthy scalp appearance with minor imperfections, such as occasional small flakes, slight unevenness, or minimal redness, but overall appearance is mostly clear and smooth.
                ##
                80-100: Excellent scalp appearance, characterized by a smooth, even tone with no visible flakes, redness, or other noticeable imperfections. The scalp appears clean, healthy, and well-maintained.`,
    },
    body: {
      belly: `0-20 points: The belly region, including the rectus abdominis, obliques, and surrounding muscles, appears smooth and underdeveloped. There is minimal muscle tone and definition, with the abdominal area lacking noticeable firmness or shape. The overall appearance is soft and undefined, with no visible separation or sculpting of the muscles.
          ##
          20-40 points: The belly shows some signs of muscle development but remains below average in tone and definition. The rectus abdominis may exhibit a slight increase in firmness, but there is minimal visible separation between the upper and lower sections. The obliques might start to show minimal shape, but the overall appearance remains relatively smooth and lacking in distinct definition.
          ##
          40-60 points: The belly region displays moderate muscle development and tone. The rectus abdominis is more defined, showing visible but not pronounced separation and firmness. The obliques exhibit moderate definition, contributing to a more sculpted appearance. The overall look is well-toned and balanced, with noticeable improvement in muscle shape and a leaner, more refined silhouette.
          ##
          60-80 points: The belly demonstrates above-average tone and definition. The rectus abdominis is well-defined, with clear separation between the upper and lower sections, creating a more sculpted and elegant appearance. The obliques are prominently defined, adding to the overall shape with a refined, athletic look. The belly region is smooth, firm, and aesthetically pleasing.
          ##
          80-100 points: The belly region exhibits exceptional tone and beauty. The rectus abdominis is highly sculpted, with prominent separation and a well-defined, elegant appearance. The obliques are highly refined, contributing to a beautifully balanced and streamlined silhouette. The overall look is strikingly toned and aesthetically impressive, showcasing outstanding fitness and a perfectly feminine, polished shape.`,
      back: `0-20: The back lacks any visible muscle tone and appears undefined.
          ##20-40: The back lacks noticeable muscle definition and appears flat.
          ##40-60: The back shows some muscle definition but lacks overall sculpting.
          ##60-80: The back shows noticeable muscle definition but lacks sculpting.
          ##80-100: The back displays excellent muscle definition with a lean and sculpted appearance.`,
      arms: `0-20: Arms lack any visible muscle tone and definition. They appear soft and undefined, with minimal visible firmness or shape.
          ##
          20-40: Some muscle tone is visible but not well-defined. Arms show noticeable laxity or softness. The overall definition remains limited and the arms appear somewhat smooth and lacking in pronounced shape.
          ##
          40-60: Muscle definition is visible but not sculpted. The muscle development is not uniform with some areas appearing less toned and not defined. 
          60-80: Arms have moderate muscle tone and definition, with noticeable firmness and shape in the biceps and triceps. They appear lean and proportional to the body, with some sculpting.
          ##
          80-100 Points: Arms exhibit well-defined muscle tone and shape, typical of a fit and athletic appearance. Biceps and triceps are visibly toned and firm, contributing to an aesthetically pleasing and sculpted look. The arms are well-proportioned and exhibit a high level of muscular definition and firmness.`,
      thighs: `0-20: The thighs appear soft and underdeveloped, with minimal muscle tone and definition. The overall shape is smooth, lacking noticeable firmness or curvature. The quadriceps, hamstrings, and inner thigh muscles are not visibly defined, resulting in a uniform and undefined appearance.
          ##
          20-40: The thighs show some signs of muscle development but remain below average in tone and definition. The quadriceps and hamstrings may exhibit a slight increase in firmness, but there is minimal visible definition. The inner thigh area may start to show some shape, but the overall appearance remains relatively smooth and lacking in prominent muscularity.
          ##
          40-60: The thighs in this category display moderate muscle development and tone. The quadriceps and hamstrings are more defined, showing visible but not pronounced firmness and shape. The inner thighs have a more toned appearance, with noticeable improvement in muscle structure and overall silhouette. The look is solid and well-toned, reflecting regular physical activity and a more sculpted thigh region.
          ##
          60-80: The thighs demonstrate above-average tone and definition. The quadriceps and hamstrings are well-defined, contributing to a more curvaceous and athletic appearance. The inner thighs exhibit significant firmness and a refined shape, with noticeable definition and improved muscle tone. The overall appearance is more aesthetically pleasing, reflecting consistent physical activity and a balanced, feminine silhouette.
          ##
          80-100: The thighs exhibit exceptional tone and definition. The quadriceps, hamstrings, and inner thighs are highly sculpted, with a beautifully firm and well-defined appearance. The thighs showcase strikingly toned muscles, with elegant curvature and prominent definition. The overall look is exceptionally refined and aesthetically impressive, highlighting outstanding fitness and a beautifully feminine shape.`,
      calves: `0-20 The calves appear soft and underdeveloped, with minimal muscle tone and definition. The gastrocnemius and soleus muscles are smooth and lack noticeable firmness or shape. The overall appearance is uniform and lacking in any prominent definition, resulting in a soft and undefined look.
          ##20-40: The calves show some signs of muscle development but remain below average in tone and definition. The gastrocnemius and soleus muscles may appear slightly firmer, but there is still a lack of visible definition. The calves start to show a bit more shape but still appear relatively smooth and lacking in distinct muscularity.
          ##40-60: The calves in this category display moderate improvement in muscle development. The gastrocnemius and soleus muscles are more defined, showing visible but not pronounced firmness and shape. The calves have a more toned appearance, with noticeable improvement in muscle structure and overall shape. The look is solid and well-toned, reflecting regular physical activity.
          ##60-80: the calves demonstrate above-average tone and definition. The gastrocnemius and soleus muscles are well-defined and firm, contributing to a more sculpted appearance. The calves exhibit a lean and athletic look, with noticeable shape and improved muscle tone. The overall appearance is more refined, reflecting consistent physical activity.
          ##80-100: The calves exhibit an exceptional level of tone and definition. The gastrocnemius and soleus muscles are highly sculpted, with a lean and elegant appearance. The calves are exceptionally firm and well-defined, with a sleek and aesthetically pleasing shape. The overall look is strikingly toned and refined, showcasing outstanding fitness`,
      hips: `0-20: Hips and glutes appear flat with no noticeable muscle definition. There is little to no curvature or separation, blending into the surrounding thigh area with a straight or minimally contoured appearance.
        ##20-40: There is a subtle curve starting to develop in hips and minor definition are evident in glutes, but it remains underdefined. The transition from the hips to the thighs is not well-pronounced.
        ##40-60: Noticeable curvature and definition are present in hips and moderate development with increased roundness and a fuller appearance is present in glutes. The hips show a clear, more rounded transition from the waist to the thighs. There is visible muscle definition, contributing to a more shapely contour.
        ##60-80: Hips are highly defined with a pronounced curve. The hips are complemented by the well-developed glutes, contributing significantly to a balanced and aesthetically pleasing silhouette. The shape is prominent and stands out, indicating good muscular strength and tone.
        ##80-100: Hips are extremely well-developed with an exceptional curve. The hips are highly prominent, enhancing the overall aesthetics and working harmoniously with the glutes for a striking appearance. The shape is highly pronounced and considered a standout feature.`,
    },
  },
  male: {
    head: {
      mouth: `
          0-20: Severe oral health issues. This range represents conditions such as advanced periodontal disease with deep gum pockets, multiple missing teeth, extensive decay visible on many teeth, or untreated infections causing visible swelling or bellycesses.
          ##
          20-40: Poor oral health. Individuals in this range might exhibit noticeable dental problems, such as moderate periodontal disease with visible gum recession and bleeding, several untreated cavities, or significant plaque buildup causing teeth discoloration.
          ##
          40-60: Fair oral health. This category could include people with occasional dental issues, such as early signs of gum disease with slight redness and swelling, a few small cavities that might not be immediately noticeable, or occasional gum irritation without severe symptoms.
          ##
          60-80: Good oral health. People in this range typically have few dental issues, such as minimal plaque, healthy pink gums without signs of inflammation, and teeth that are generally free of decay or discoloration beyond minor cosmetic concerns.
          ##
          80-100: Excellent oral health. This represents optimal dental health, including strong and well-maintained teeth, healthy pink gums with no signs of recession or inflammation, and no visible decay or staining.
          `,
      skin: `0-20: Severe skin issues, such as extensive acne, cysts, open wounds, or severe burns that heavily compromise skin integrity and appearance.
                    ##
                    20-40: Significant skin problems, including persistent acne, deep scars, noticeable discoloration, or rough texture that affect overall skin quality and appearance.
                    ##
                    40-60: Moderate skin concerns, like occasional breakouts, mild pigmentation issues, rough patches, or visible signs of aging (fine lines and wrinkles).
                    ##
                    60-80: Generally healthy skin with minor imperfections, such as occasional pimples, slight dryness or oiliness, and minimal signs of aging.
                    ##
                    80-100: Excellent skin health, characterized by smooth texture, even tone, no visible pores, and a radiant appearance. Little to no signs of aging, acne, or other skin issues.
                    `,
      lips: `
                    0-20: Severe dryness and cracking, visible flaking.
                    ##
                    20-40: Dry with some cracking, noticeable rough texture.
                    ##
                    40-60: Moderately dry, occasional cracking, slight roughness.
                    ##
                    60-80: Generally smooth but slightly dry, minimal cracking if any.
                    ##
                    80-100: Perfectly smooth and moisturized, no cracking, soft and supple.
              `,
      eyes: `
                  0-20: Deep wrinkles, extensive crow's feet, severe under-eye bags or puffiness, prominent dark circles, and very poor skin texture with significant laxity.
                  ##
                  20-40: Moderate wrinkles around the eyes, noticeable crow's feet, moderate under-eye bags or puffiness, some dark circles, and beginning signs of skin laxity and uneven texture.
                  ##
                  40-60: Fine lines around the eyes, mild crow's feet, slight under-eye bags or puffiness, mild dark circles that can be improved with treatment, and moderate skin texture issues.
                  ##
                  60-80: Few or no wrinkles around the eyes, minimal crow's feet, occasional under-eye bags or puffiness that is easily managed, minimal dark circles, and generally smooth and firm skin texture.
                  ##
                  80-100: No visible wrinkles or lines around the eyes, no crow's feet, no under-eye bags or puffiness, no dark circles, and very smooth, firm, and youthful skin texture.
                  `,
      grooming: `
          0-20: If the person has a beard: The beard is completely unkempt and messy. The beard is wild, uneven, and looks completely neglected. If the person doesn't have a beard: The shaven area is uneven or poorly shaved with visible stubble.
          ##
          20-40: If the person has a beard: the beard is somewhat uneven or patchy. If the person doesn't have a beard: The shaven area may have some missed spots or rough patches.
          ##
          40-60: If the person has a beard: The beard is generally trimmed but might still have uneven edges or stray hairs. If the person doesn't have a beard: The shaven area is generally smooth but not perfectly clean.
          ##
          60-80: If the person has a beard: The beard is neatly trimmed with well-defined edges. If the person doesn't have a beard: The shaven area is clean with minimal stubble visible.
          ##
          80-100: If the person has a beard: The beard is perfectly shaped with clean lines and even growth. If the person doesn't have a beard: The shaven area is smooth and perfectly clean-shaven. `,
      scalp: `
          0-20: Severe scalp issues, such as extensive dandruff, psoriasis, eczema, open sores, or severe inflammation that significantly disrupt scalp integrity and appearance.
          ##
          20-40: Significant scalp problems, including persistent dandruff, noticeable dryness or oiliness, deep flakes, or moderate inflammation affecting overall scalp quality and appearance.
          ##
          40-60: Moderate scalp appearance concerns, such as occasional flakes or dry patches, slight redness, or minor texture irregularities that mildly affect the visual quality of the scalp.
          ##
          60-80: Generally healthy scalp appearance with minor imperfections, such as occasional small flakes, slight unevenness, or minimal redness, but overall appearance is mostly clear and smooth.
          ##
          80-100: Excellent scalp appearance, characterized by a smooth, even tone with no visible flakes, redness, or other noticeable imperfections. The scalp appears clean, healthy, and well-maintained.`,
    },
    body: {
      chest: `0-20: The chest region, including the pectoralis major, pectoralis minor, and surrounding muscles, exhibits minimal development. The chest appears smooth and soft, lacking any noticeable muscle tone or definition. The pectoralis major lacks prominent separation and definition, and the pectoralis minor is not visibly distinct. Overall, the chest is underdeveloped with a uniform and undefined appearance.
          ##
          20-40: The chest shows some signs of muscle development but remains below average in tone and definition. The pectoralis major may exhibit a slight increase in firmness but lacks significant separation or definition. The pectoralis minor may begin to show minimal shape but remains somewhat smooth. The overall chest area has a somewhat improved shape but still lacks pronounced muscularity and definition.
          ##
          40-60: The chest region displays moderate muscle development. The pectoralis major is more defined, with visible but not pronounced separation and firmness. The pectoralis minor shows moderate definition, contributing to a more structured appearance. The chest has a more solid and toned look, with noticeable improvement in muscle shape and firmness.
          ##
          60-80: The chest demonstrates above-average muscle tone and definition. The pectoralis major is well-defined, with clear separation and a noticeable, robust appearance. The pectoralis minor is prominently visible, contributing to a fuller and more sculpted chest. The overall chest area shows significant firmness and an athletic appearance.
          ##
          80-100: The chest region exhibits exceptional muscle development and definition. The pectoralis major is highly sculpted, with prominent, deep separation and exceptional definition, creating a powerful and muscular appearance. The pectoralis minor is highly visible and well-defined, adding to the overall impressive look. The chest is extraordinarily firm and muscular, with a highly impressive and aesthetically striking appearance.`,
      belly: `0-20 points: The belly region, including the rectus abdominis, obliques, and lower back, shows minimal muscle development and definition. The abdominal area appears soft and smooth with no visible muscle tone or definition. The rectus abdominis lacks noticeable separation, the obliques are not discernible, and the lower back is smooth without distinct muscle definition. The overall appearance is untoned and lacking firmness.
          ##
          20-40 points: The belly region exhibits some muscle development but remains below average in tone and definition. The rectus abdominis may show a slight increase in firmness but lacks significant separation into individual six-pack sections. The obliques may start to show minimal shape but remain somewhat undefined. The lower back shows slight improvement in firmness but lacks prominent muscle definition. Overall, the belly region has a somewhat better shape but still lacks clear definition.
          ##
          40-60 points: The belly region displays moderate muscle development. The rectus abdominis is more defined, with visible separation between the upper and lower sections, though the six-pack is not yet highly pronounced. The obliques exhibit moderate definition, contributing to a more sculpted appearance. The lower back is firmer and shows some definition, contributing to an overall toned and structured look. The belly region appears solid and well-toned.
          ##
          60-80 points: The belly region demonstrates above-average muscle tone and definition. The rectus abdominis is well-defined, with clear separation into distinct six-pack sections and noticeable muscle definition. The obliques are prominently defined, showing significant separation and a V-shape along the sides of the torso. The lower back is highly defined, with visible muscle groups and a robust appearance. The overall look is athletic and impressive, indicative of consistent strength training and low body fat.
          ##
          80-100 points: The belly region exhibits exceptional muscle development and definition. The rectus abdominis is highly sculpted, with prominent, deep separation between the six-pack sections and a highly defined appearance. The obliques are extraordinarily well-defined, with intricate muscle detail and a striking V-shape. The lower back is exceptionally defined, contributing to a muscular and aesthetically impressive appearance. The entire belly region conveys outstanding strength and conditioning, with a highly impressive and aesthetically striking look.`,
      arms: `0-20: The arms, including the biceps, triceps, and forearms, show minimal muscle development. The biceps appear smooth and underdeveloped with little to no definition or firmness, lacking noticeable shape. The triceps are not discernible, and the overall arm appears soft and lacking in muscle tone. The forearms also lack definition and firmness, contributing to a uniform and undefined appearance.
          ##
          20-40: The arms exhibit some signs of muscle development but remain below average in tone and definition. The biceps may have a slight increase in firmness but lack significant separation or definition. The triceps begin to show minimal shape but remain somewhat smooth and undefined. The forearms may show slight improvement in firmness, but overall, the arms have a somewhat better shape yet still lack pronounced muscularity.
          ##
          40-60: Arms in this category display moderate muscle development. The biceps are more defined, showing visible but not pronounced separation and firmness. The triceps exhibit moderate definition, with noticeable separation along the back of the upper arm. The forearms are firmer and show some definition, contributing to a more toned and structured appearance. Overall, the arms appear solid and well-toned, reflecting regular physical activity.
          ##
          60-80: The arms demonstrate above-average muscle tone and definition. The biceps are well-defined, with clear separation and noticeable peaks when flexed. The triceps are prominently defined, with significant separation and a robust appearance along the back of the upper arm. The forearms exhibit high definition, with visible muscle groups and prominent vascularity. The overall appearance of the arms is athletic and impressive, indicative of consistent strength training or physical activity. 
          ##
          80-100: Arms exhibit exceptional muscle development and definition. The biceps are highly sculpted, with prominent peaks, deep separation, and exceptional definition. The triceps are extraordinarily well-defined, showing intricate muscle detail and substantial separation. The forearms are highly defined, with prominent muscularity and visible vascularity. The entire arm region conveys outstanding strength and conditioning, with a strikingly muscular and aesthetically impressive appearance.`,
      legs: `0-20: Legs exhibit minimal muscle development, appearing soft and lacking noticeable tone or definition. There is a general absence of firmness and shape, resulting in a smooth and underdeveloped appearance. Both thighs and calves blend seamlessly without distinct separation.
          ##
          20-40: Legs show some muscle development but remain below average in tone and definition. They may appear slightly firmer than in the lower range but still lack significant muscularity. The separation between muscle groups is minimal, and the overall shape remains somewhat undefined.
          ##
          40-60: Legs display moderate muscle development with visible, though not pronounced, definition. Thighs and calves have a reasonably toned appearance, with some separation between muscle groups indicating a foundation of strength. The overall look is solid and well-toned.
          ##
          60-80: Legs exhibit above-average muscle tone and definition. There is clear separation between the thighs, calves, and other muscle groups, with noticeable firmness and a robust, athletic appearance. This level indicates significant muscle development.
          ##
          80-100: Legs in this range demonstrate exceptional muscle development and definition. They are highly sculpted, with prominent, well-defined muscles throughout. Thighs and calves show outstanding firmness and separation, reflecting a high level of fitness and muscularity. The overall appearance is strikingly muscular and aesthetically impressive, conveying exceptional strength and conditioning.`,
      back: `0-20: The back muscles, including the latissimus dorsi, rhomboids, trapezius, and erector spinae, exhibit minimal development. The back appears smooth and underdeveloped with little to no visible muscle tone or definition. The latissimus dorsi lack noticeable width and definition, the rhomboids are not discernible, and the trapezius appears smooth without distinct separation. The erector spinae are not visibly defined, contributing to a soft and undefined overall appearance.
          ##20-40: The back muscles show some development but remain below average in terms of tone and definition. The latissimus dorsi may exhibit a slight increase in width but lack significant separation and definition. The rhomboids and trapezius start to show minimal shape, though they remain somewhat smooth and undefined. The erector spinae may be slightly firmer but still lack prominent definition. The overall back shape improves slightly but lacks clear muscle separation and definition.
          ##40-60: The back displays moderate muscle development. The latissimus dorsi are more defined, with visible but not pronounced width and separation, contributing to a more solid and toned appearance. The rhomboids and trapezius show moderate definition, with noticeable separation between muscle groups and a more structured look. The erector spinae are visibly firmer and show some definition along the lower back. Overall, the back appears well-toned with moderate muscle definition and shape.
          ##60-80: The back demonstrates above-average muscle tone and definition. The latissimus dorsi are well-defined, with clear separation from the lower back and a noticeable V-shape. The rhomboids and trapezius exhibit significant definition, with detailed separation and a pronounced upper back structure. The erector spinae are highly visible, contributing to a strong and well-defined lower back. The overall appearance is robust and athletic, reflecting consistent strength training and physical conditioning.
          ##80-100: Back muscles exhibit exceptional development and definition. The latissimus dorsi are highly sculpted, with prominent width and clear separation from the lower back, creating an impressive V-taper. The rhomboids and trapezius are extraordinarily well-defined, with intricate muscle detail and exceptional separation, extending from the neck to the upper back. The erector spinae are highly visible and well-defined, adding to the overall muscular and aesthetic appeal of the back. The entire back region conveys outstanding strength and conditioning, with an exceptionally impressive and aesthetically striking appearance.`,
      shoulders: `0-20: The shoulder muscles, including the deltoids, trapezius, and rotator cuff muscles, exhibit minimal development. The deltoids lack definition and firmness, appearing smooth and underdeveloped. The trapezius muscles show little to no noticeable structure or separation, and the rotator cuff muscles are not visibly defined. Overall, the shoulders are soft, lacking in tone and shape, and the muscle groups blend seamlessly without distinct borders.
          ##20-40: The shoulder muscles show some signs of development but remain below average in tone and definition. The deltoids may have a slight increase in firmness but lack significant separation or definition. The trapezius muscles might begin to show a hint of shape, but the overall appearance remains somewhat undefined. The rotator cuff muscles are still not prominently visible, and the overall shoulder area has a somewhat improved shape but lacks pronounced muscularity.
          ##40-60: Shoulders display moderate muscle development. The deltoids are more toned, with visible but not pronounced definition, showing some separation between the anterior, lateral, and posterior heads. The trapezius muscles exhibit moderate firmness and a more defined appearance, with noticeable muscle separation along the upper back. The rotator cuff muscles may show mild definition, contributing to a more solid and athletic shoulder shape. The overall appearance is well-toned, reflecting regular physical activity.
          ##60-80: Shoulders demonstrate above-average muscle tone and definition. The deltoids are well-defined, with clear separation between the anterior, lateral, and posterior heads, resulting in a robust and athletic appearance. The trapezius muscles are prominent, showing significant definition and separation along the upper and middle back. The rotator cuff muscles are visibly defined, contributing to the overall firmness and shape of the shoulders. The shoulders have a strikingly athletic look, indicative of consistent strength training or physical activity.
          ##80-100: Shoulders exhibit exceptional muscle development and definition. The deltoids are highly sculpted, with prominent and well-defined separation between the anterior, lateral, and posterior heads. The trapezius muscles are extraordinarily well-developed, with detailed definition and exceptional separation extending from the neck to the upper back. The rotator cuff muscles are highly visible and well-defined, adding to the overall muscular and aesthetic appeal of the shoulders. The entire shoulder region conveys outstanding strength and conditioning, with a highly impressive and aesthetically striking appearance.`,
    },
  },
};

export default criteria;
