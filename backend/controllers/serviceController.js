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

