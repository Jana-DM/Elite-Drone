const bcrypt = require('bcrypt');

async function runSeed(pool) {
  console.log('🌱 Seeding default data for Elite Drone Service...');

  // 1. Seed Admin User
  const adminCheck = await pool.query('SELECT id FROM admin_users WHERE username = $1', ['admin']);
  if (adminCheck.rows.length === 0) {
    const adminPasswordHash = await bcrypt.hash('Admin@Elite2026!', 10);
    await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      ['admin', 'admin@elitedrone.com', adminPasswordHash, 'Elite Administrator', 'superadmin']
    );
    console.log('✅ Default superadmin created (admin / Admin@Elite2026!)');
  } else {
    console.log('ℹ️ Admin user already exists.');
  }

  // 2. Seed Services
  const servicesData = [
    {
      slug: 'wedding-drone-photography',
      name: 'Wedding Drone Photography',
      category: 'wedding',
      short_description: 'Cinematic aerial photography & 4K video capturing romantic wedding memories from breathtaking heights.',
      full_description: 'Elevate your special day with breathtaking aerial perspectives. Our certified pilots capture intimate moments, grand venue reveals, guest arrivals, and dramatic bridal procession shots with ultra-smooth 4K cinematic clarity. Fully insured with dual-operator capability.',
      image_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
      badge: 'Most Popular',
      display_order: 1
    },
    {
      slug: 'event-drone-videography',
      name: 'Event Drone Videography',
      category: 'event',
      short_description: 'High-energy aerial coverage for corporate summits, concerts, festivals, and sports spectacles.',
      full_description: 'Dynamic aerial filming delivering comprehensive event coverage from dynamic angles impossible with ground crews. We deliver live streaming feeds, highlight reels, and crowd captures compliant with safety protocols.',
      image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
      badge: 'Trending',
      display_order: 2
    },
    {
      slug: 'real-estate-aerial-photography',
      name: 'Real Estate Aerial Photography',
      category: 'real-estate',
      short_description: 'Showcase luxury villas, commercial developments, and expansive estates to accelerate property sales.',
      full_description: 'Present properties in their full context. Highlight boundaries, neighborhood proximity, scenic views, architectural lines, and property scale with HDR aerial imaging and 360-degree panoramas tailored for premium listings.',
      image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      badge: 'Commercial',
      display_order: 3
    },
    {
      slug: 'outdoor-cinematography',
      name: 'Outdoor Cinematography',
      category: 'cinematography',
      short_description: 'Expansive landscape, tourism, adventure sports, and cinematic documentary aerial production.',
      full_description: 'For filmmakers, tourism boards, and creators seeking majestic vistas. We fly cinema-grade drones capable of high winds, fast tracking, and cinematic color science (D-Log 10-bit 4K/60fps) across mountains, coastlines, and forests.',
      image_url: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=80',
      badge: 'Cinematic 4K',
      display_order: 4
    },
    {
      slug: 'custom-drone-shooting',
      name: 'Custom Drone Shooting',
      category: 'custom',
      short_description: 'Tailored aerial missions, infrastructure surveys, industrial progress monitoring, and bespoke shoots.',
      full_description: 'Every project is unique. Whether you require periodic construction progress captures, agricultural surveys, architectural documentation, or custom creative sequences, our team configures equipment and flight plans to your exact brief.',
      image_url: 'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=1200&q=80',
      badge: 'Customizable',
      display_order: 5
    }
  ];

  for (const s of servicesData) {
    const existing = await pool.query('SELECT id FROM services WHERE slug = $1', [s.slug]);
    let serviceId;
    if (existing.rows.length === 0) {
      const res = await pool.query(
        `INSERT INTO services (slug, name, category, short_description, full_description, image_url, badge, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [s.slug, s.name, s.category, s.short_description, s.full_description, s.image_url, s.badge, s.display_order]
      );
      serviceId = res.rows[0].id;
      console.log(`✅ Service created: ${s.name}`);
    } else {
      serviceId = existing.rows[0].id;
    }

    // Seed Packages for this service if not present
    const pkgCheck = await pool.query('SELECT id FROM packages WHERE service_id = $1', [serviceId]);
    if (pkgCheck.rows.length === 0) {
      const packages = [
        {
          name: 'Silver Package',
          tier: 'Silver',
          description: 'Essential aerial shoot for focused coverage and highlight captures.',
          duration_hours: 2.0,
          price: 14999.00,
          pricing_type: 'starting_at',
          features: JSON.stringify([
            '2 Hours Flight Time',
            '1 Certified Drone Pilot',
            '25 High-Resolution Edited Photos',
            '1.5-Min 4K Highlight Reel',
            'Digital Cloud Delivery in 48 Hours'
          ]),
          is_popular: false,
          display_order: 1
        },
        {
          name: 'Gold Package',
          tier: 'Gold',
          description: 'Comprehensive aerial coverage with full production and raw footage.',
          duration_hours: 4.0,
          price: 27999.00,
          pricing_type: 'starting_at',
          features: JSON.stringify([
            '4 Hours Flight Time',
            'Pilot + Visual Observer / Cameraman',
            '60 HDR Color-Graded Photos',
            '3-Min 4K Master Video with Sound Design',
            'All Raw Footage Provided (SSD)',
            'Digital Cloud Delivery in 72 Hours'
          ]),
          is_popular: true,
          display_order: 2
        },
        {
          name: 'Platinum Cinematic',
          tier: 'Platinum',
          description: 'Full-day premium aerial cinematography with dual-pilot cinema rig.',
          duration_hours: 8.0,
          price: 49999.00,
          pricing_type: 'starting_at',
          features: JSON.stringify([
            'Full Day Coverage (Up to 8 Hours)',
            '2 Certified Drone Pilots + Dual Controls',
            'Unlimited HDR Aerial Photos',
            'Cinematic 4K/60fps Long-form Film + Teaser Reel',
            'Licensed Commercial Music Soundtrack',
            'Priority 24-Hour Express Turnaround',
            'Complete Raw 10-bit D-Log Archive'
          ]),
          is_popular: false,
          display_order: 3
        }
      ];

      for (const p of packages) {
        await pool.query(
          `INSERT INTO packages (service_id, name, tier, description, duration_hours, price, pricing_type, features, is_popular, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [serviceId, p.name, p.tier, p.description, p.duration_hours, p.price, p.pricing_type, p.features, p.is_popular, p.display_order]
        );
      }
      console.log(`  📦 Seeded 3 packages for ${s.name}`);
    }
  }

  // 3. Seed Gallery Items
  const galleryCheck = await pool.query('SELECT count(*) FROM gallery_items');
  if (parseInt(galleryCheck.rows[0].count, 10) === 0) {
    const galleryItems = [
      {
        title: 'Sunset Coastal Villa Showcase',
        category: 'real-estate',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80',
        description: 'Golden hour aerial perspective of a private waterfront property with expansive terrace and pool.',
        location: 'Goa Coastal Belt',
        is_featured: true,
        display_order: 1
      },
      {
        title: 'Royal Heritage Palace Wedding',
        category: 'wedding',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=80',
        description: 'Intimate aerial capture of royal courtyard procession with floral arrangements and festive lanterns.',
        location: 'Udaipur, Rajasthan',
        is_featured: true,
        display_order: 2
      },
      {
        title: 'Mountain Ridge Cinematic Flyover',
        category: 'cinematography',
        media_type: 'video',
        media_url: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-winding-mountain-road-41444-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=400&q=80',
        description: 'Ultra-wide dynamic tracking shot across mountain roads and mist-shrouded peaks at dawn.',
        location: 'Himachal Pradesh',
        is_featured: true,
        display_order: 3
      },
      {
        title: 'Grand City Music Festival',
        category: 'event',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=400&q=80',
        description: 'High-altitude panorama capturing main stage lighting, 15,000 attendees, and pyrotechnics display.',
        location: 'Bengaluru Tech Park Grounds',
        is_featured: true,
        display_order: 4
      },
      {
        title: 'Emerald Valley Tea Plantation',
        category: 'landscape',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
        description: 'Symmetrical patterns of lush green hillside tea estates under soft morning sunlight.',
        location: 'Munnar, Kerala',
        is_featured: false,
        display_order: 5
      },
      {
        title: 'Ocean Surf and Rocky Cliffs',
        category: 'cinematography',
        media_type: 'video',
        media_url: 'https://assets.mixkit.co/videos/preview/mixkit-top-view-of-waves-breaking-on-the-shore-41584-large.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
        description: 'Bird-eye top-down view of turquoise waves crashing against dramatic cliffs.',
        location: 'Varkala Beach',
        is_featured: true,
        display_order: 6
      },
      {
        title: 'Luxury High-Rise Penthouse Aerial',
        category: 'real-estate',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=400&q=80',
        description: 'Drone view showcasing panoramic skyline vistas from a 42nd-floor luxury penthouse.',
        location: 'Mumbai Skyline',
        is_featured: false,
        display_order: 7
      },
      {
        title: 'Beachside Destination Vows',
        category: 'wedding',
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=400&q=80',
        description: 'Sunset mandap on white sand with sweeping drone shot of bride and groom.',
        location: 'Alibaug, Maharashtra',
        is_featured: true,
        display_order: 8
      }
    ];

    for (const g of galleryItems) {
      await pool.query(
        `INSERT INTO gallery_items (title, category, media_type, media_url, thumbnail_url, description, location, is_featured, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [g.title, g.category, g.media_type, g.media_url, g.thumbnail_url, g.description, g.location, g.is_featured, g.display_order]
      );
    }
    console.log(`✅ Seeded ${galleryItems.length} gallery items (photos & videos)`);
  }

  console.log('✅ Seeding completed.');
}

module.exports = { runSeed };

