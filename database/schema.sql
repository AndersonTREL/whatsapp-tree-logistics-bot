-- Tree Logistics DSP Database Schema
-- SQLite database for storing operational data

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    employee_id TEXT UNIQUE,
    hire_date DATE,
    contract_type TEXT DEFAULT 'full-time',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Equipment Inventory
CREATE TABLE IF NOT EXISTS equipment_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL, -- scanner, sim_card, uniform, cable, battery
    model_name TEXT,
    serial_number TEXT UNIQUE,
    status TEXT DEFAULT 'available', -- available, assigned, maintenance, broken
    quantity_in_stock INTEGER DEFAULT 0,
    assigned_to_driver_id INTEGER,
    assigned_date DATE,
    last_maintenance DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to_driver_id) REFERENCES drivers(id)
);

-- Equipment Requests
CREATE TABLE IF NOT EXISTS equipment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    model_preference TEXT,
    quantity INTEGER DEFAULT 1,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, fulfilled, rejected
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_date DATETIME,
    fulfilled_date DATETIME,
    notes TEXT,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_number TEXT UNIQUE NOT NULL,
    vehicle_type TEXT, -- sprinter, van, truck
    license_plate TEXT UNIQUE,
    status TEXT DEFAULT 'operational', -- operational, maintenance, damaged, retired
    last_service_date DATE,
    next_service_date DATE,
    mileage INTEGER DEFAULT 0,
    assigned_to_driver_id INTEGER,
    fuel_card_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to_driver_id) REFERENCES drivers(id)
);

-- Vehicle Incidents
CREATE TABLE IF NOT EXISTS vehicle_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    incident_type TEXT NOT NULL, -- damage, accident, maintenance, fuel
    description TEXT,
    severity TEXT DEFAULT 'minor', -- minor, moderate, major, critical
    incident_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_date DATETIME,
    photo_url TEXT,
    location TEXT,
    status TEXT DEFAULT 'reported', -- reported, under_review, resolved
    cost REAL DEFAULT 0,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Shifts and Schedules
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    station TEXT DEFAULT 'DA10',
    zone TEXT,
    route_number TEXT,
    vehicle_id INTEGER,
    estimated_packages INTEGER,
    actual_packages INTEGER,
    status TEXT DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

-- Shift Swap Requests
CREATE TABLE IF NOT EXISTS shift_swaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requesting_driver_id INTEGER NOT NULL,
    target_driver_id INTEGER,
    original_shift_id INTEGER NOT NULL,
    requested_shift_id INTEGER,
    swap_type TEXT DEFAULT 'find_replacement', -- find_replacement, specific_swap
    reason TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected, completed
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_date DATETIME,
    FOREIGN KEY (requesting_driver_id) REFERENCES drivers(id),
    FOREIGN KEY (target_driver_id) REFERENCES drivers(id),
    FOREIGN KEY (original_shift_id) REFERENCES shifts(id),
    FOREIGN KEY (requested_shift_id) REFERENCES shifts(id)
);

-- HR - Salary Records
CREATE TABLE IF NOT EXISTS salary_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL,
    month TEXT NOT NULL, -- 2025-09
    base_salary REAL NOT NULL,
    overtime_hours REAL DEFAULT 0,
    overtime_pay REAL DEFAULT 0,
    bonus REAL DEFAULT 0,
    deductions REAL DEFAULT 0,
    net_salary REAL NOT NULL,
    payment_date DATE,
    payment_status TEXT DEFAULT 'pending', -- pending, paid
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- HR - Leave/Vacation
CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL, -- vacation, sick, personal, emergency
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INTEGER NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_date DATETIME,
    approved_by TEXT,
    notes TEXT,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- HR - Vacation Balance
CREATE TABLE IF NOT EXISTS vacation_balance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER UNIQUE NOT NULL,
    year INTEGER NOT NULL,
    total_days INTEGER DEFAULT 25,
    used_days INTEGER DEFAULT 0,
    pending_days INTEGER DEFAULT 0,
    remaining_days INTEGER DEFAULT 25,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Amazon DSP Performance Metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL,
    date DATE NOT NULL,
    packages_delivered INTEGER DEFAULT 0,
    packages_assigned INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 100,
    packages_per_hour REAL DEFAULT 0,
    customer_rating REAL DEFAULT 5.0,
    photo_compliance REAL DEFAULT 100,
    safety_score REAL DEFAULT 100,
    on_time_delivery REAL DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Conversation Context (for multi-turn conversations)
CREATE TABLE IF NOT EXISTS conversation_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    context_data TEXT, -- JSON string
    last_message TEXT,
    conversation_state TEXT, -- active, waiting_response, closed
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone_number);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment_inventory(status);
CREATE INDEX IF NOT EXISTS idx_shifts_driver_date ON shifts(driver_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_salary_driver_month ON salary_records(driver_id, month);
CREATE INDEX IF NOT EXISTS idx_performance_driver_date ON performance_metrics(driver_id, date);
CREATE INDEX IF NOT EXISTS idx_context_phone ON conversation_context(phone_number);

