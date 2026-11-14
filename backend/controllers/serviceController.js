const db = require('../config/db');

// Get all active services with their packages
exports.getAllServices = async (req, res) => {
  try {
    const servicesRes = await db.query(
      `SELECT * FROM services WHERE is_active = TRUE ORDER BY display_order ASC, id ASC`
    );

    const packagesRes = await db.query(
      `SELECT * FROM packages ORDER BY display_order ASC, price ASC`
    );

    // Group packages by service_id
    const packagesMap = {};
    packagesRes.rows.forEach(pkg => {
      if (!packagesMap[pkg.service_id]) {
        packagesMap[pkg.service_id] = [];
      }
      packagesMap[pkg.service_id].push(pkg);
    });

    const services = servicesRes.rows.map(svc => ({
      ...svc,
      packages: packagesMap[svc.id] || []
    }));

    res.json({
      success: true,
      data: services
    });
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve services' });
  }
};

// Get single service by slug
exports.getServiceBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const serviceRes = await db.query(
      `SELECT * FROM services WHERE slug = $1 AND is_active = TRUE`,
      [slug]
    );

    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const service = serviceRes.rows[0];
    const packagesRes = await db.query(
      `SELECT * FROM packages WHERE service_id = $1 ORDER BY display_order ASC, price ASC`,
      [service.id]
    );

    service.packages = packagesRes.rows;

    res.json({
      success: true,
      data: service
    });
  } catch (err) {
    console.error('Error fetching service:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve service' });
  }
};

// 3. Admin: Create Service
exports.createService = async (req, res) => {
  try {
    const { name, slug, short_description, full_description, description, image_url, category, badge } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Service name is required.' });
    }

    const cleanSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/-+/g, '-');
    const sDesc = short_description || description || 'Professional commercial drone aerial cinematography.';
    const fDesc = full_description || description || sDesc;
    const defaultImg = image_url || 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=80';

    const insertRes = await db.query(`
      INSERT INTO services (name, slug, short_description, full_description, image_url, category, badge, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *
    `, [name.trim(), cleanSlug, sDesc, fDesc, defaultImg, category || 'Aerial Cinematography', badge || null]);

    return res.status(201).json({
      success: true,
      message: 'Service created successfully!',
      service: insertRes.rows[0],
    });
  } catch (err) {
    console.error('Error creating service:', err);
    return res.status(500).json({ success: false, message: 'Failed to create service.' });
  }
};

// 4. Admin: Update Service
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, short_description, full_description, description, image_url, is_active } = req.body;

    const sDesc = short_description || description || null;
    const fDesc = full_description || description || null;

    const updateRes = await db.query(`
      UPDATE services 
      SET name = COALESCE($1, name),
          short_description = COALESCE($2, short_description),
          full_description = COALESCE($3, full_description),
          image_url = COALESCE($4, image_url),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [name, sDesc, fDesc, image_url, is_active, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    return res.json({
      success: true,
      message: 'Service updated successfully!',
      service: updateRes.rows[0],
    });
  } catch (err) {
    console.error('Error updating service:', err);
    return res.status(500).json({ success: false, message: 'Failed to update service.' });
  }
};

// 5. Admin: Delete or Deactivate Service
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE services SET is_active = FALSE WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Service deactivated successfully.' });
  } catch (err) {
    console.error('Error deactivating service:', err);
    return res.status(500).json({ success: false, message: 'Failed to deactivate service.' });
  }
};

