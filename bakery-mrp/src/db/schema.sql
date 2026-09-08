-- Bakery Purchasing + MRP + BOM System
-- PostgreSQL Schema (matches Phase 1 design document)

CREATE TABLE units (
    unit_id SERIAL PRIMARY KEY,
    unit_code VARCHAR(20) UNIQUE NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    unit_type VARCHAR(20) NOT NULL CHECK (unit_type IN ('WEIGHT','VOLUME','COUNT'))
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','PURCHASING','WAREHOUSE','MANAGEMENT')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_code VARCHAR(30) UNIQUE NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('FINISHED','SEMI_FINISHED')),
    base_unit_id INT REFERENCES units(unit_id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(100),
    address TEXT,
    payment_term VARCHAR(50),
    credit_term VARCHAR(50),
    lead_time_days INT DEFAULT 0,
    moq NUMERIC(18,3) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    product_category VARCHAR(100)
);

CREATE TABLE materials (
    material_id SERIAL PRIMARY KEY,
    material_code VARCHAR(30) UNIQUE NOT NULL,
    material_name VARCHAR(150) NOT NULL,
    material_type VARCHAR(20) NOT NULL CHECK (material_type IN ('RAW','PACKAGING')),
    category VARCHAR(100),
    base_unit_id INT REFERENCES units(unit_id),
    purchase_unit_id INT REFERENCES units(unit_id),
    conversion_rate NUMERIC(18,6) NOT NULL DEFAULT 1, -- base units per 1 purchase unit
    primary_supplier_id INT REFERENCES suppliers(supplier_id),
    current_price NUMERIC(18,4) DEFAULT 0,
    last_purchase_price NUMERIC(18,4),
    moq NUMERIC(18,3) DEFAULT 0,
    lead_time_days INT DEFAULT 0,
    safety_stock NUMERIC(18,3) DEFAULT 0,
    reorder_point NUMERIC(18,3) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE supplier_documents (
    document_id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL REFERENCES suppliers(supplier_id),
    document_type VARCHAR(50) NOT NULL,
    document_name VARCHAR(150) NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    file_url TEXT,
    uploaded_by INT REFERENCES users(user_id),
    uploaded_date TIMESTAMP DEFAULT now()
);

CREATE TABLE price_history (
    price_history_id SERIAL PRIMARY KEY,
    material_id INT NOT NULL REFERENCES materials(material_id),
    supplier_id INT REFERENCES suppliers(supplier_id),
    price NUMERIC(18,4) NOT NULL,
    effective_date DATE NOT NULL,
    created_by INT REFERENCES users(user_id),
    created_date TIMESTAMP DEFAULT now()
);

-- BOM header: one row per (product, version)
CREATE TABLE bom (
    bom_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id),
    version VARCHAR(20) NOT NULL,
    effective_date DATE NOT NULL,
    expire_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','DISABLED')),
    created_by INT REFERENCES users(user_id),
    approved_by INT REFERENCES users(user_id),
    created_date TIMESTAMP DEFAULT now(),
    UNIQUE(product_id, version)
);

-- BOM detail: component_product_id XOR component_material_id must be set
CREATE TABLE bom_detail (
    bom_detail_id SERIAL PRIMARY KEY,
    bom_id INT NOT NULL REFERENCES bom(bom_id) ON DELETE CASCADE,
    component_type VARCHAR(20) NOT NULL CHECK (component_type IN ('SEMI_FINISHED','RAW_MATERIAL','PACKAGING')),
    component_product_id INT REFERENCES products(product_id),
    component_material_id INT REFERENCES materials(material_id),
    quantity NUMERIC(18,6) NOT NULL,
    unit_id INT REFERENCES units(unit_id),
    loss_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    yield_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
    sequence INT DEFAULT 0,
    CONSTRAINT chk_component_ref CHECK (
        (component_type = 'SEMI_FINISHED' AND component_product_id IS NOT NULL AND component_material_id IS NULL)
        OR
        (component_type IN ('RAW_MATERIAL','PACKAGING') AND component_material_id IS NOT NULL AND component_product_id IS NULL)
    )
);

CREATE INDEX idx_bom_detail_bom ON bom_detail(bom_id);
CREATE INDEX idx_bom_detail_component_material ON bom_detail(component_material_id);
CREATE INDEX idx_bom_detail_component_product ON bom_detail(component_product_id);

CREATE TABLE forecast (
    forecast_id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    month INT NOT NULL,
    product_id INT NOT NULL REFERENCES products(product_id),
    quantity NUMERIC(18,3) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entered_by INT REFERENCES users(user_id),
    note TEXT,
    current_version_no INT NOT NULL DEFAULT 1,
    UNIQUE(year, month, product_id)
);

CREATE TABLE forecast_revision (
    revision_id SERIAL PRIMARY KEY,
    forecast_id INT NOT NULL REFERENCES forecast(forecast_id),
    version_no INT NOT NULL,
    quantity NUMERIC(18,3) NOT NULL,
    revised_date TIMESTAMP DEFAULT now(),
    revised_by INT REFERENCES users(user_id),
    note TEXT,
    UNIQUE(forecast_id, version_no)
);

CREATE TABLE forecast_adjustment (
    adjustment_id SERIAL PRIMARY KEY,
    forecast_id INT NOT NULL REFERENCES forecast(forecast_id),
    adjust_date DATE NOT NULL DEFAULT CURRENT_DATE,
    additional_qty NUMERIC(18,3) NOT NULL,
    customer_channel VARCHAR(150),
    note TEXT,
    entered_by INT REFERENCES users(user_id)
);

CREATE TABLE stock (
    stock_id SERIAL PRIMARY KEY,
    material_id INT REFERENCES materials(material_id),
    semi_finished_product_id INT REFERENCES products(product_id),
    on_hand_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT now(),
    CHECK (
        (material_id IS NOT NULL AND semi_finished_product_id IS NULL)
        OR (material_id IS NULL AND semi_finished_product_id IS NOT NULL)
    )
);

CREATE TABLE mrp (
    mrp_id SERIAL PRIMARY KEY,
    forecast_id INT NOT NULL REFERENCES forecast(forecast_id),
    material_id INT REFERENCES materials(material_id),
    semi_finished_product_id INT REFERENCES products(product_id),
    bom_version_used VARCHAR(20),
    gross_requirement NUMERIC(18,3) NOT NULL,
    safety_stock NUMERIC(18,3) NOT NULL DEFAULT 0,
    current_stock NUMERIC(18,3) NOT NULL DEFAULT 0,
    open_po_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
    scheduled_receipt_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
    net_requirement NUMERIC(18,3) NOT NULL DEFAULT 0,
    actual_purchase_qty NUMERIC(18,3),
    calculated_date TIMESTAMP DEFAULT now(),
    status VARCHAR(50)
);

CREATE TABLE production_requirement (
    production_req_id SERIAL PRIMARY KEY,
    mrp_id INT REFERENCES mrp(mrp_id),
    semi_finished_product_id INT NOT NULL REFERENCES products(product_id),
    gross_requirement NUMERIC(18,3) NOT NULL,
    current_stock NUMERIC(18,3) NOT NULL DEFAULT 0,
    open_production_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
    net_production_requirement NUMERIC(18,3) NOT NULL DEFAULT 0,
    period VARCHAR(20)
);

CREATE TABLE purchase_request (
    pr_id SERIAL PRIMARY KEY,
    mrp_id INT REFERENCES mrp(mrp_id),
    material_id INT NOT NULL REFERENCES materials(material_id),
    requested_qty NUMERIC(18,3) NOT NULL,
    requested_value NUMERIC(18,2),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_by INT REFERENCES users(user_id),
    created_date TIMESTAMP DEFAULT now()
);

CREATE TABLE purchase_order (
    po_id SERIAL PRIMARY KEY,
    po_number VARCHAR(30) UNIQUE NOT NULL,
    po_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_id INT NOT NULL REFERENCES suppliers(supplier_id),
    buyer_id INT REFERENCES users(user_id),
    expected_delivery_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN
        ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
    total_value NUMERIC(18,2) DEFAULT 0
);

CREATE TABLE purchase_order_detail (
    po_detail_id SERIAL PRIMARY KEY,
    po_id INT NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
    material_id INT NOT NULL REFERENCES materials(material_id),
    pr_id INT REFERENCES purchase_request(pr_id),
    ordered_qty NUMERIC(18,3) NOT NULL,
    unit_id INT REFERENCES units(unit_id),
    unit_price NUMERIC(18,4) NOT NULL,
    total_value NUMERIC(18,2) NOT NULL,
    received_qty NUMERIC(18,3) NOT NULL DEFAULT 0
);

CREATE TABLE goods_receipt (
    gr_id SERIAL PRIMARY KEY,
    gr_number VARCHAR(30) UNIQUE NOT NULL,
    gr_date DATE NOT NULL DEFAULT CURRENT_DATE,
    po_id INT NOT NULL REFERENCES purchase_order(po_id),
    received_by INT REFERENCES users(user_id)
);

CREATE TABLE goods_receipt_detail (
    gr_detail_id SERIAL PRIMARY KEY,
    gr_id INT NOT NULL REFERENCES goods_receipt(gr_id) ON DELETE CASCADE,
    po_detail_id INT NOT NULL REFERENCES purchase_order_detail(po_detail_id),
    received_qty NUMERIC(18,3) NOT NULL
);

CREATE TABLE audit_log (
    audit_id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INT NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by INT REFERENCES users(user_id),
    changed_date TIMESTAMP DEFAULT now()
);
