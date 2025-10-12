-- Sample Data for Tree Logistics DSP System
-- This creates demo data for testing

-- Sample Drivers
INSERT OR IGNORE INTO drivers (phone_number, first_name, last_name, employee_id, hire_date, contract_type, status) VALUES
('whatsapp:+4917616626841', 'Anderson', 'Meta', 'TL-2024-001', '2024-01-01', 'full-time', 'active'),
('whatsapp:+4917673562457', 'John', 'Smith', 'TL-2024-002', '2024-02-15', 'full-time', 'active'),
('whatsapp:+491234567890', 'Sarah', 'Johnson', 'TL-2024-003', '2024-03-01', 'part-time', 'active');

-- Equipment Inventory
INSERT OR IGNORE INTO equipment_inventory (item_type, model_name, serial_number, status, quantity_in_stock) VALUES
('scanner', 'Zebra TC21', 'ZEB-001', 'available', 5),
('scanner', 'Honeywell CT40', 'HON-001', 'available', 2),
('sim_card', 'Vodafone Data', 'SIM-001', 'available', 10),
('uniform', 'Blue Shirt L', 'UNI-L-001', 'available', 8),
('uniform', 'Blue Shirt M', 'UNI-M-001', 'available', 6),
('cable', 'USB-C Charging Cable', 'CBL-001', 'available', 15),
('battery', 'Scanner Battery Pack', 'BAT-001', 'available', 12);

-- Assign equipment to Anderson
UPDATE equipment_inventory 
SET status = 'assigned', assigned_to_driver_id = 1, assigned_date = '2024-01-15' 
WHERE serial_number IN ('ZEB-001');

-- Vehicles
INSERT OR IGNORE INTO vehicles (vehicle_number, vehicle_type, license_plate, status, mileage, fuel_card_number, assigned_to_driver_id, last_service_date, next_service_date) VALUES
('SPRINTER-205', 'Mercedes Sprinter', 'B-TL-205', 'operational', 45000, 'FUEL-1234', 1, '2025-09-25', '2025-11-25'),
('SPRINTER-206', 'Mercedes Sprinter', 'B-TL-206', 'operational', 38000, 'FUEL-1235', 2, '2025-09-20', '2025-11-20'),
('VAN-107', 'Ford Transit', 'B-TL-107', 'operational', 52000, 'FUEL-1236', 3, '2025-09-15', '2025-11-15');

-- Shifts for next week (Anderson)
INSERT OR IGNORE INTO shifts (driver_id, shift_date, start_time, end_time, station, zone, vehicle_id, estimated_packages, status) VALUES
(1, '2025-10-14', '06:00', '14:00', 'DA10', 'Zone 4', 1, 185, 'scheduled'),
(1, '2025-10-15', '06:00', '14:00', 'DA10', 'Zone 7', 1, 165, 'scheduled'),
(1, '2025-10-17', '06:00', '14:00', 'DA10', 'Zone 4', 1, 195, 'scheduled'),
(1, '2025-10-18', '06:00', '14:00', 'DA10', 'Zone 5', 1, 170, 'scheduled');

-- Salary Records
INSERT OR IGNORE INTO salary_records (driver_id, month, base_salary, overtime_hours, overtime_pay, bonus, deductions, net_salary, payment_date, payment_status) VALUES
(1, '2025-09', 2500.00, 12, 180.00, 100.00, 700.00, 2080.00, '2025-10-05', 'paid'),
(1, '2025-10', 2500.00, 0, 0, 0, 700.00, 1800.00, '2025-11-05', 'pending');

-- Vacation Balance
INSERT OR IGNORE INTO vacation_balance (driver_id, year, total_days, used_days, pending_days, remaining_days) VALUES
(1, 2025, 25, 13, 2, 10),
(2, 2025, 25, 8, 0, 17),
(3, 2025, 20, 5, 1, 14);

-- Performance Metrics for Anderson (last 10 days)
INSERT OR IGNORE INTO performance_metrics (driver_id, date, packages_delivered, packages_assigned, success_rate, packages_per_hour, customer_rating, photo_compliance, safety_score) VALUES
(1, '2025-10-01', 187, 190, 98.4, 23, 4.9, 99.5, 100),
(1, '2025-10-02', 172, 175, 98.3, 21, 4.8, 99.0, 100),
(1, '2025-10-03', 195, 200, 97.5, 24, 4.9, 99.8, 100),
(1, '2025-10-04', 183, 185, 98.9, 23, 5.0, 100, 100),
(1, '2025-10-08', 190, 195, 97.4, 23, 4.9, 98.9, 100),
(1, '2025-10-09', 178, 180, 98.9, 22, 4.8, 99.2, 100),
(1, '2025-10-10', 185, 190, 97.4, 23, 4.9, 99.0, 100);

