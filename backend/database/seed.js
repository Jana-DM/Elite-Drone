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
      slug: 'aerial-photography',
      name: 'Aerial Photography',
      category: 'photography',
      short_description: 'Stunning aerial photographs that showcase places, landscapes and special moments from above.',
      full_description: 'High-resolution aerial photography captured with precision optics. Perfect for estates, architectural showcases, commercial developments, and private milestones.',
      image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
      badge: '01',
      emoji: '📷',
      display_order: 1
    },
    {
      slug: 'aerial-videography',
      name: 'Aerial Videography',
      category: 'videography',
      short_description: 'Cinematic drone videos designed to capture smooth, dynamic and memorable aerial footage.',
      full_description: 'Silky smooth 4K and 5.1K Apple ProRes aerial videography with 3-axis gimbal stabilization. From cinematic fly-throughs to sweeping tracking shots.',
      image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
      badge: '02',
      emoji: '📹',
      display_order: 2
    },
    {
      slug: 'event-special-moments',
      name: 'Event & Special Moments',
      category: 'events',
      short_description: 'Capture important events and special moments with breathtaking aerial perspectives.',
      full_description: 'Comprehensive aerial coverage for royal weddings, concerts, sporting spectacles, and landmark celebrations. DGCA-compliant crowd safety with dual-pilot operations.',
      image_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
      badge: '03',
      emoji: '🚁',
      display_order: 3
    },
    {
      slug: 'nature-landscape',
      name: 'Nature & Landscape',
      category: 'landscape',
      short_description: 'Beautiful aerial visuals of nature, roads, locations and scenic environments.',
      full_description: 'Majestic aerial cinematography of mountain ranges, ocean coastlines, forest trails, and scenic destinations tailored for tourism boards and cinematic films.',
      image_url: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=80',
      badge: '04',
      emoji: '🌄',
      display_order: 4
    },
    {
      slug: 'custom-drone-shoots',
      name: 'Custom Drone Shoots',
      category: 'custom',
      short_description: 'Have a location or creative idea? Tell us what you need and we will plan the shot around your vision.',
      full_description: 'Bespoke flight planning for complex creative briefs, industrial mapping, infrastructure progress documentation, and specialized sensor payloads.',
      image_url: 'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=1200&q=80',
      badge: '05',
      emoji: '✨',
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
        title: 'Nature Aerial',
        category: 'photography',
        media_type: 'image',
        media_url: 'images/gallery/nature-aerial.jpg',
        thumbnail_url: 'images/gallery/nature-aerial.jpg',
        description: 'Capturing the beauty of nature from above.',
        location: '01 / PHOTOGRAPHY',
        is_featured: true,
        display_order: 1
      },
      {
        title: 'Highway View',
        category: 'photography',
        media_type: 'image',
        media_url: 'images/gallery/highway-view.jpg',
        thumbnail_url: 'images/gallery/highway-view.jpg',
        description: 'An aerial perspective showcasing roads and landscapes.',
        location: '02 / PHOTOGRAPHY',
        is_featured: true,
        display_order: 2
      },
      {
        title: 'Hill Station Vista',
        category: 'photography',
        media_type: 'image',
        media_url: 'images/gallery/hill-station-aerial.jpg',
        thumbnail_url: 'images/gallery/hill-station-aerial.jpg',
        description: 'Panoramic aerial view of lush hill valleys and high-altitude settlements.',
        location: '03 / PHOTOGRAPHY',
        is_featured: true,
        display_order: 3
      },
      {
        title: 'Thanjavur Aerial',
        category: 'photography',
        media_type: 'image',
        media_url: 'images/gallery/thanjavur-aerial.jpg',
        thumbnail_url: 'images/gallery/thanjavur-aerial.jpg',
        description: 'A unique aerial perspective of Thanjavur.',
        location: '04 / PHOTOGRAPHY',
        is_featured: true,
        display_order: 4
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

