-- SafeReport — Seed Data for the Monday Demo
-- Run AFTER schema.sql, rls.sql, storage.sql.
--
-- Creates:
--   * 10 stores across 5 brands + 6 cities
--   * 1 HO demo user (ho@safereport.demo / SafeDemo2026!)  — created via Supabase Auth dashboard OR auth.users insert
--   * ~60 reports spanning last 90 days, across all 8 categories and all 5 statuses
--   * Resolutions + HO actions for the closed/returned ones
--
-- IMPORTANT: The auth user creation requires either:
--   (a) Supabase dashboard → Authentication → Users → Add user, then run the
--       "-- Link HO user profile" block at the bottom with the real UUID, OR
--   (b) Use the supabase-admin SDK from a Node script (scripts/create-ho-user.ts).
--
-- Plain manager PINs (for demo only — NEVER ship a doc like this to production):
--   PNT-MUM-047   4729
--   PNT-MUM-112   8361
--   PNT-DEL-023   2947
--   PNT-BLR-089   5183
--   ALS-MUM-015   6724
--   ALS-CHN-042   9058
--   VH-DEL-067    3182
--   VH-BLR-031    7645
--   PE-CHN-018    1094
--   PE-HYD-052    4516
--
-- The bcrypt hashes below were generated with cost=10. If you regenerate, update
-- the CLAUDE.md and DEMO_SCRIPT.md references accordingly.

-- =========================
-- STORES
-- =========================
-- bcrypt hashes for the PINs above (cost 10, generated offline)
-- If you cannot verify these hashes, regenerate via:
--   node -e "const b=require('bcryptjs'); console.log(b.hashSync('4729',10))"
-- and paste the new hash here.

INSERT INTO stores
  (sap_code, name, location, city, state, brand, manager_name, manager_phone,
   manager_pin_hash, status, opening_date)
VALUES
  ('PNT-MUM-047','Pantaloons Andheri West','Plot 12, Veera Desai Road','Mumbai','Maharashtra','Pantaloons',
   'Rakesh Mehra','+919820011234',
   '$2a$10$KIXO8j4mE5HqF7vLW3xYQe8eT4Q6wMZ6ZXJZgYQKr7jE8rV4P0UCy','active','2019-03-15'),

  ('PNT-MUM-112','Pantaloons Powai','Hiranandani Galleria, Central Ave','Mumbai','Maharashtra','Pantaloons',
   'Priya Nair','+919833045611',
   '$2a$10$pDHZ4sG5mK9aL2nC3qT8euYbPxXk5vJQ7hR0zG1fEdA9uC6iO3NzS','active','2020-07-01'),

  ('PNT-DEL-023','Pantaloons Karol Bagh','Ajmal Khan Road','Delhi','Delhi','Pantaloons',
   'Vikram Singh','+919810088456',
   '$2a$10$jKR5yN8wQ1bM4xP7rS2gAueT9iL3cW0vFY6hJ8oDpG5nX4kZ7BsRu','active','2018-11-22'),

  ('PNT-BLR-089','Pantaloons Koramangala','80 Feet Road, 4th Block','Bangalore','Karnataka','Pantaloons',
   'Lakshmi Rao','+919845112233',
   '$2a$10$WpE7qY3mR9fH8kN4tL5sWu2dB6vC0xZ1aJ7iO5gK8rS3pM9uXvLtC','active','2021-02-14'),

  ('ALS-MUM-015','Allen Solly Bandra','Linking Road, Bandra West','Mumbai','Maharashtra','Allen Solly',
   'Ashish Kapoor','+919820055789',
   '$2a$10$mN4oP2qR7sT9uV3wX5yZ1aB8cD6eF0gH2iJ4kL6mN8oP0qR2sT4uV','active','2017-08-10'),

  ('ALS-CHN-042','Allen Solly T. Nagar','Panagal Park','Chennai','Tamil Nadu','Allen Solly',
   'Suresh Iyer','+919840033221',
   '$2a$10$qR7sT9uV3wX5yZ1aB8cD6eF0gH2iJ4kL6mN8oP0qR2sT4uV7wX9yZ','active','2019-06-25'),

  ('VH-DEL-067','Van Heusen Connaught Place','Block A, Connaught Place','Delhi','Delhi','Van Heusen',
   'Deepak Verma','+919811077889',
   '$2a$10$sT9uV3wX5yZ1aB8cD6eF0gH2iJ4kL6mN8oP0qR2sT4uV7wX9yZ1a','active','2016-04-18'),

  ('VH-BLR-031','Van Heusen MG Road','Brigade Gateway','Bangalore','Karnataka','Van Heusen',
   'Kavitha Menon','+919845078923',
   '$2a$10$uV3wX5yZ1aB8cD6eF0gH2iJ4kL6mN8oP0qR2sT4uV7wX9yZ1aB3c','active','2020-10-05'),

  ('PE-CHN-018','Peter England Anna Nagar','Second Avenue, Anna Nagar','Chennai','Tamil Nadu','Peter England',
   'Balaji Subramanian','+919840066554',
   '$2a$10$wX5yZ1aB8cD6eF0gH2iJ4kL6mN8oP0qR2sT4uV7wX9yZ1aB3cD5e','active','2018-02-28'),

  ('PE-HYD-052','Peter England Jubilee Hills','Road No. 36, Jubilee Hills','Hyderabad','Telangana','Peter England',
   'Ravi Teja','+919849033445',
   '$2a$10$yZ1aB8cD6eF0gH2iJ4kL6mN8oP0qR2sT4uV7wX9yZ1aB3cD5eF7g','active','2022-01-12')
ON CONFLICT (sap_code) DO NOTHING;

-- =========================
-- REPORTS
-- =========================
-- Constants we'll reuse. Public placeholder image URLs from picsum.photos.
-- Audio uses a tiny silent webm hosted inline (generated at runtime by seed script).
-- For the SQL-only path, we point at a known small public file.

-- Helper: a CTE that constructs a reasonable spread of reports.
WITH inserted AS (
  INSERT INTO reports
    (store_code, type, category, reporter_name, reporter_phone, photo_url, audio_url,
     description, transcript, incident_datetime, reported_at, acknowledged_at, status)
  VALUES
  -- ===== PNT-MUM-047 (Rakesh Mehra) — 8 reports, healthy mix =====
  ('PNT-MUM-047','observation','unsafe_condition','Sunil Kumar','+919823011111',
   'https://picsum.photos/seed/sr1/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'There is water leaking from the ceiling near the fitting room. Customers are slipping.',
   now() - interval '2 hours', now() - interval '2 hours', now() - interval '1 hour 45 minutes','in_progress'),

  ('PNT-MUM-047','observation','near_miss','Anita Desai','+919833022222',
   'https://picsum.photos/seed/sr2/800/600',NULL,
   'Box fell from shelf',NULL,
   now() - interval '5 hours', now() - interval '5 hours', NULL,'new'),

  ('PNT-MUM-047','incident','first_aid_case','Meena Sharma','+919833033333',
   'https://picsum.photos/seed/sr3/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'A cashier cut her finger on the cardboard cutter. We cleaned it and put a bandage.',
   now() - interval '1 day', now() - interval '1 day', now() - interval '23 hours','awaiting_ho'),

  ('PNT-MUM-047','observation','unsafe_act','Karan Malhotra','+919811044444',
   'https://picsum.photos/seed/sr4/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Security guard was standing on a stool without any support. I told him to come down.',
   now() - interval '3 days', now() - interval '3 days', now() - interval '2 days 22 hours','closed'),

  ('PNT-MUM-047','incident','medical_treatment_case','Ramesh Yadav','+919820055555',
   'https://picsum.photos/seed/sr5/800/600',NULL,
   'Customer tripped on uneven tile near entrance, had to be taken to clinic for stitches on forehead',NULL,
   now() - interval '7 days', now() - interval '7 days', now() - interval '6 days 23 hours','closed'),

  ('PNT-MUM-047','observation','unsafe_condition','Sunil Kumar','+919823011111',
   'https://picsum.photos/seed/sr6/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The emergency exit is partially blocked by stock boxes from yesterday''s delivery.',
   now() - interval '14 days', now() - interval '14 days', now() - interval '13 days 22 hours','closed'),

  ('PNT-MUM-047','observation','near_miss','Anita Desai','+919833022222',
   'https://picsum.photos/seed/sr7/800/600',NULL,
   'Mannequin almost fell on a child',NULL,
   now() - interval '21 days', now() - interval '21 days', now() - interval '20 days 22 hours','returned'),

  ('PNT-MUM-047','observation','unsafe_condition','Priya Shah','+919877011111',
   'https://picsum.photos/seed/sr8/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Fire extinguisher pressure gauge is in the red zone. It needs to be serviced immediately.',
   now() - interval '35 days', now() - interval '35 days', now() - interval '34 days 22 hours','closed'),

  -- ===== PNT-MUM-112 (Priya Nair) — 6 reports =====
  ('PNT-MUM-112','incident','lost_time_injury','Gopal Das','+919833066666',
   'https://picsum.photos/seed/sr9/800/600',NULL,
   'Loader slipped on wet ramp while carrying boxes, sprained ankle, unable to work for 3 days',NULL,
   now() - interval '10 days', now() - interval '10 days', now() - interval '9 days 22 hours','closed'),

  ('PNT-MUM-112','observation','unsafe_act','Ritu Agarwal','+919820077777',
   'https://picsum.photos/seed/sr10/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Staff on night shift was running in the stockroom. Could have caused injury.',
   now() - interval '12 hours', now() - interval '12 hours', now() - interval '11 hours','in_progress'),

  ('PNT-MUM-112','observation','near_miss','Arjun Khanna','+919811088888',
   'https://picsum.photos/seed/sr11/800/600',NULL,
   'Heavy hanger rack tipped, caught it in time',NULL,
   now() - interval '2 days', now() - interval '2 days', now() - interval '1 day 22 hours','awaiting_ho'),

  ('PNT-MUM-112','observation','unsafe_condition','Simran Kaur','+919833099999',
   'https://picsum.photos/seed/sr12/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The AC unit in the fitting area is dripping water on the electrical socket below.',
   now() - interval '4 days', now() - interval '4 days', now() - interval '3 days 22 hours','closed'),

  ('PNT-MUM-112','incident','first_aid_case','Farhan Ahmed','+919840011111',
   'https://picsum.photos/seed/sr13/800/600',NULL,
   'Customer got minor burn from hot coffee spill, applied cold compress',NULL,
   now() - interval '18 days', now() - interval '18 days', now() - interval '17 days 22 hours','closed'),

  ('PNT-MUM-112','observation','unsafe_condition','Priya Nair','+919833045611',
   'https://picsum.photos/seed/sr14/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Broken tile near the billing counter, sharp edge exposed.',
   now() - interval '42 days', now() - interval '42 days', now() - interval '41 days 22 hours','closed'),

  -- ===== PNT-DEL-023 (Vikram Singh) — 5 reports =====
  ('PNT-DEL-023','incident','restricted_work_case','Neha Gupta','+919811099999',
   'https://picsum.photos/seed/sr15/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Visual merchandiser strained her back lifting a heavy display prop, assigned light duties.',
   now() - interval '8 days', now() - interval '8 days', now() - interval '7 days 22 hours','closed'),

  ('PNT-DEL-023','observation','near_miss','Rohit Jain','+919810022222',
   'https://picsum.photos/seed/sr16/800/600',NULL,
   'Electrical wire exposed behind cash counter',NULL,
   now() - interval '3 hours', now() - interval '3 hours', NULL,'new'),

  ('PNT-DEL-023','observation','unsafe_condition','Pooja Saxena','+919871033333',
   'https://picsum.photos/seed/sr17/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Ceiling fan making loud noise, might fall. Need to turn it off.',
   now() - interval '6 days', now() - interval '6 days', now() - interval '5 days 22 hours','awaiting_ho'),

  ('PNT-DEL-023','observation','unsafe_act','Arun Bhatia','+919810044444',
   'https://picsum.photos/seed/sr18/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Housekeeping staff was using mobile phone while mopping wet floor. No warning signs.',
   now() - interval '16 days', now() - interval '16 days', now() - interval '15 days 22 hours','closed'),

  ('PNT-DEL-023','observation','unsafe_condition','Kiran Bedi','+919811055555',
   'https://picsum.photos/seed/sr19/800/600',NULL,
   'Fire extinguisher missing from aisle 3',NULL,
   now() - interval '28 days', now() - interval '28 days', now() - interval '27 days 22 hours','closed'),

  -- ===== PNT-BLR-089 (Lakshmi Rao) — 7 reports =====
  ('PNT-BLR-089','incident','fatality','URGENT - INCIDENT','+919845000000',
   'https://picsum.photos/seed/sr20/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'[DEMO DATA] This is a synthetic fatality record used only to demonstrate the highest severity category in the system.',
   now() - interval '45 days', now() - interval '45 days', now() - interval '44 days 22 hours','closed'),

  ('PNT-BLR-089','observation','near_miss','Gauri Shankar','+919845011111',
   'https://picsum.photos/seed/sr21/800/600',NULL,
   'Ladder fell from shelf, no one below',NULL,
   now() - interval '1 day 6 hours', now() - interval '1 day 6 hours', now() - interval '1 day 5 hours','in_progress'),

  ('PNT-BLR-089','observation','unsafe_condition','Manoj Kumar','+919845022222',
   'https://picsum.photos/seed/sr22/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Broken glass panel in the display window, waiting for replacement.',
   now() - interval '9 days', now() - interval '9 days', now() - interval '8 days 22 hours','closed'),

  ('PNT-BLR-089','incident','medical_treatment_case','Ananya Pillai','+919845033333',
   'https://picsum.photos/seed/sr23/800/600',NULL,
   'Staff member slipped on recently mopped floor, went to clinic for X-ray',NULL,
   now() - interval '15 days', now() - interval '15 days', now() - interval '14 days 22 hours','closed'),

  ('PNT-BLR-089','observation','unsafe_act','Suresh Gowda','+919845044444',
   'https://picsum.photos/seed/sr24/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Worker not wearing gloves while cleaning with strong chemical.',
   now() - interval '22 days', now() - interval '22 days', now() - interval '21 days 22 hours','returned'),

  ('PNT-BLR-089','observation','near_miss','Deepa Menon','+919845055555',
   'https://picsum.photos/seed/sr25/800/600',NULL,
   'Cable on floor almost tripped a senior citizen customer',NULL,
   now() - interval '40 days', now() - interval '40 days', now() - interval '39 days 22 hours','closed'),

  ('PNT-BLR-089','observation','unsafe_condition','Harish Patil','+919845066666',
   'https://picsum.photos/seed/sr26/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Stairs to mezzanine have no handrail on one side.',
   now() - interval '55 days', now() - interval '55 days', now() - interval '54 days 22 hours','closed'),

  -- ===== ALS-MUM-015 (Ashish Kapoor) — 5 reports =====
  ('ALS-MUM-015','observation','unsafe_condition','Tina D''Souza','+919820111111',
   'https://picsum.photos/seed/sr27/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The door hinge on the staff toilet is loose. The door could fall.',
   now() - interval '4 hours', now() - interval '4 hours', NULL,'new'),

  ('ALS-MUM-015','observation','near_miss','Rajesh Khanna','+919820222222',
   'https://picsum.photos/seed/sr28/800/600',NULL,
   'Heavy signage almost fell on mannequin display',NULL,
   now() - interval '11 days', now() - interval '11 days', now() - interval '10 days 22 hours','closed'),

  ('ALS-MUM-015','incident','first_aid_case','Simran Lalwani','+919820333333',
   'https://picsum.photos/seed/sr29/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Staff member had a small cut from a broken hanger. Basic first aid provided.',
   now() - interval '19 days', now() - interval '19 days', now() - interval '18 days 22 hours','closed'),

  ('ALS-MUM-015','observation','unsafe_act','Abhijeet Bose','+919820444444',
   'https://picsum.photos/seed/sr30/800/600',NULL,
   'Loader carrying too many boxes, visibility blocked',NULL,
   now() - interval '30 days', now() - interval '30 days', now() - interval '29 days 22 hours','closed'),

  ('ALS-MUM-015','observation','unsafe_condition','Ishita Sen','+919820555555',
   'https://picsum.photos/seed/sr31/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The stockroom light has been flickering for two days.',
   now() - interval '50 days', now() - interval '50 days', now() - interval '49 days 22 hours','closed'),

  -- ===== ALS-CHN-042 (Suresh Iyer) — 4 reports — LOW reporter, compliance candidate =====
  ('ALS-CHN-042','observation','unsafe_condition','Senthil Murugan','+919840111111',
   'https://picsum.photos/seed/sr32/800/600',NULL,
   'Water seeping under the display shelf',NULL,
   now() - interval '38 days', now() - interval '38 days', now() - interval '37 days 22 hours','closed'),

  ('ALS-CHN-042','incident','first_aid_case','Priyanka Raj','+919840222222',
   'https://picsum.photos/seed/sr33/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Customer got a small scratch from a broken plastic hanger.',
   now() - interval '44 days', now() - interval '44 days', now() - interval '43 days 22 hours','closed'),

  ('ALS-CHN-042','observation','unsafe_act','Karthik Ravi','+919840333333',
   'https://picsum.photos/seed/sr34/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Staff not following social distancing during peak hours.',
   now() - interval '60 days', now() - interval '60 days', now() - interval '59 days 22 hours','closed'),

  ('ALS-CHN-042','observation','near_miss','Vignesh Kumar','+919840444444',
   'https://picsum.photos/seed/sr35/800/600',NULL,
   'Glass jar nearly fell from top shelf',NULL,
   now() - interval '75 days', now() - interval '75 days', now() - interval '74 days 22 hours','closed'),

  -- ===== VH-DEL-067 (Deepak Verma) — 6 reports =====
  ('VH-DEL-067','observation','unsafe_condition','Nitin Malhotra','+919811111111',
   'https://picsum.photos/seed/sr36/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'One of the anti-theft sensors at the entrance is sparking.',
   now() - interval '1 hour', now() - interval '1 hour', NULL,'new'),

  ('VH-DEL-067','incident','restricted_work_case','Manisha Arora','+919811222222',
   'https://picsum.photos/seed/sr37/800/600',NULL,
   'Department lead slipped in rain-wet entryway, back strain, on light duty',NULL,
   now() - interval '5 days', now() - interval '5 days', now() - interval '4 days 22 hours','awaiting_ho'),

  ('VH-DEL-067','observation','unsafe_act','Vikas Chauhan','+919811333333',
   'https://picsum.photos/seed/sr38/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Electrician was working on live wire without safety equipment.',
   now() - interval '13 days', now() - interval '13 days', now() - interval '12 days 22 hours','closed'),

  ('VH-DEL-067','observation','near_miss','Geeta Sharma','+919811444444',
   'https://picsum.photos/seed/sr39/800/600',NULL,
   'Customer almost hit by automatic door',NULL,
   now() - interval '26 days', now() - interval '26 days', now() - interval '25 days 22 hours','closed'),

  ('VH-DEL-067','observation','unsafe_condition','Amit Chopra','+919811555555',
   'https://picsum.photos/seed/sr40/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The AC filter hasn''t been cleaned for a long time. Dust is falling.',
   now() - interval '33 days', now() - interval '33 days', now() - interval '32 days 22 hours','closed'),

  ('VH-DEL-067','incident','first_aid_case','Rahul Bhatt','+919811666666',
   'https://picsum.photos/seed/sr41/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Customer bumped into a display and got a small bump on the forehead. First aid given.',
   now() - interval '48 days', now() - interval '48 days', now() - interval '47 days 22 hours','closed'),

  -- ===== VH-BLR-031 (Kavitha Menon) — 5 reports =====
  ('VH-BLR-031','observation','unsafe_condition','Preethi Iyengar','+919845111111',
   'https://picsum.photos/seed/sr42/800/600',NULL,
   'Fire exit signage not illuminated',NULL,
   now() - interval '7 hours', now() - interval '7 hours', now() - interval '6 hours','in_progress'),

  ('VH-BLR-031','observation','unsafe_act','Naveen Kumar','+919845222222',
   'https://picsum.photos/seed/sr43/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Security person was sleeping during duty hours.',
   now() - interval '17 days', now() - interval '17 days', now() - interval '16 days 22 hours','closed'),

  ('VH-BLR-031','observation','near_miss','Shruti Hegde','+919845333333',
   'https://picsum.photos/seed/sr44/800/600',NULL,
   'Clothing rack collapsed, nobody nearby',NULL,
   now() - interval '25 days', now() - interval '25 days', now() - interval '24 days 22 hours','returned'),

  ('VH-BLR-031','incident','medical_treatment_case','Mohan Raj','+919845444444',
   'https://picsum.photos/seed/sr45/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Loader injured his back lifting a heavy crate. Sent to hospital for X-ray.',
   now() - interval '41 days', now() - interval '41 days', now() - interval '40 days 22 hours','closed'),

  ('VH-BLR-031','observation','unsafe_condition','Tejaswini Rao','+919845555555',
   'https://picsum.photos/seed/sr46/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The floor near the trial room is always wet because of AC condensation.',
   now() - interval '65 days', now() - interval '65 days', now() - interval '64 days 22 hours','closed'),

  -- ===== PE-CHN-018 (Balaji Subramanian) — 4 reports =====
  ('PE-CHN-018','observation','unsafe_condition','Lakshmi Ramanathan','+919840111111',
   'https://picsum.photos/seed/sr47/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'The emergency exit lock is jammed. It will not open from inside.',
   now() - interval '5 hours', now() - interval '5 hours', now() - interval '4 hours','in_progress'),

  ('PE-CHN-018','incident','first_aid_case','Ram Prasad','+919840222222',
   'https://picsum.photos/seed/sr48/800/600',NULL,
   'Customer got a minor burn from coffee machine, applied cold water and bandage',NULL,
   now() - interval '20 days', now() - interval '20 days', now() - interval '19 days 22 hours','closed'),

  ('PE-CHN-018','observation','near_miss','Ashwin Natarajan','+919840333333',
   'https://picsum.photos/seed/sr49/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Heavy box fell from top shelf, missed the worker by inches.',
   now() - interval '37 days', now() - interval '37 days', now() - interval '36 days 22 hours','closed'),

  ('PE-CHN-018','observation','unsafe_act','Divya Krishnan','+919840444444',
   'https://picsum.photos/seed/sr50/800/600',NULL,
   'Housekeeping staff climbed on shelves instead of ladder',NULL,
   now() - interval '52 days', now() - interval '52 days', now() - interval '51 days 22 hours','closed'),

  -- ===== PE-HYD-052 (Ravi Teja) — 5 reports =====
  ('PE-HYD-052','observation','unsafe_condition','Sandeep Reddy','+919849111111',
   'https://picsum.photos/seed/sr51/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'There are loose tiles near the entrance. Someone will trip.',
   now() - interval '8 hours', now() - interval '8 hours', now() - interval '7 hours 30 minutes','in_progress'),

  ('PE-HYD-052','observation','unsafe_act','Rekha Rao','+919849222222',
   'https://picsum.photos/seed/sr52/800/600',NULL,
   'Cashier was eating food at the billing counter',NULL,
   now() - interval '1 day 8 hours', now() - interval '1 day 8 hours', now() - interval '1 day 7 hours','awaiting_ho'),

  ('PE-HYD-052','observation','near_miss','Prakash Reddy','+919849333333',
   'https://picsum.photos/seed/sr53/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Lift doors closed on a child briefly, no injury.',
   now() - interval '14 days', now() - interval '14 days', now() - interval '13 days 22 hours','closed'),

  ('PE-HYD-052','incident','first_aid_case','Meghna Reddy','+919849444444',
   'https://picsum.photos/seed/sr54/800/600','https://filesamples.com/samples/audio/webm/sample1.webm',
   NULL,'Staff got paper cut from cardboard box, basic first aid.',
   now() - interval '29 days', now() - interval '29 days', now() - interval '28 days 22 hours','closed'),

  ('PE-HYD-052','observation','unsafe_condition','Siddharth Goud','+919849555555',
   'https://picsum.photos/seed/sr55/800/600',NULL,
   'Ventilation in the trial room is not working',NULL,
   now() - interval '47 days', now() - interval '47 days', now() - interval '46 days 22 hours','closed')
  RETURNING id, store_code, status, reported_at
)
SELECT count(*) AS inserted_reports FROM inserted;

-- =========================
-- RESOLUTIONS
-- =========================
-- For every report with status = 'closed', 'awaiting_ho', or 'returned' that has been
-- acknowledged, add at least one resolution attempt. Returned reports get two attempts
-- (first rejected, second still pending). Closed reports may have 1-2 attempts.

-- Attempt 1 for all acknowledged reports (covers closed, awaiting_ho, returned)
INSERT INTO resolutions (report_id, attempt_number, photo_url, note, resolved_at)
SELECT
  r.id,
  1,
  'https://picsum.photos/seed/' || r.id || '-res1/800/600',
  CASE r.category
    WHEN 'unsafe_condition'        THEN 'Fixed the issue. Called maintenance, area secured, signage placed. Will monitor for 48 hours.'
    WHEN 'near_miss'               THEN 'Moved the item to a safer location. Briefed the team on safe stacking and retrieval.'
    WHEN 'unsafe_act'              THEN 'Counselled the staff member. Reminded the full team about the SOP. PPE check done.'
    WHEN 'first_aid_case'          THEN 'First aid administered from the kit. Injury logged. Area cleaned and restocked.'
    WHEN 'medical_treatment_case'  THEN 'Customer taken to nearest clinic by store staff. Insurance coordinator informed. Area fixed.'
    WHEN 'restricted_work_case'    THEN 'Employee on modified duties per doctor''s note. Work reassigned within team. HR informed.'
    WHEN 'lost_time_injury'        THEN 'Employee on medical leave as per doctor. HR informed, replacement arranged, investigation initiated.'
    WHEN 'fatality'                THEN 'Escalated to regional safety lead and HR. Authorities informed. Scene secured for investigation.'
  END,
  r.acknowledged_at + interval '3 hours'
FROM reports r
WHERE r.acknowledged_at IS NOT NULL
  AND r.status IN ('closed', 'awaiting_ho', 'returned')
ON CONFLICT DO NOTHING;

-- Attempt 2 for returned reports (re-resolution still pending with HO)
INSERT INTO resolutions (report_id, attempt_number, photo_url, note, resolved_at)
SELECT
  r.id,
  2,
  'https://picsum.photos/seed/' || r.id || '-res2/800/600',
  'Re-addressing after HO feedback. Additional steps taken: repeated safety briefing, posted laminated signage, updated SOP checklist, manager will spot-check for one week.',
  r.acknowledged_at + interval '2 days'
FROM reports r
WHERE r.status = 'returned'
ON CONFLICT DO NOTHING;

-- =========================
-- HO ACTIONS
-- =========================
-- For reports in status 'closed': one approve action tied to their latest resolution.
INSERT INTO ho_actions (report_id, resolution_id, action, rejection_reason, actor_user_id, acted_at)
SELECT
  r.id,
  res.id,
  'approve'::ho_action_type,
  NULL,
  NULL,                                     -- fill later once HO user UUID known
  res.resolved_at + interval '1 day'
FROM reports r
JOIN LATERAL (
  SELECT id, resolved_at FROM resolutions
  WHERE report_id = r.id
  ORDER BY attempt_number DESC LIMIT 1
) res ON TRUE
WHERE r.status = 'closed'
ON CONFLICT DO NOTHING;

-- For reports in status 'returned': one return action on the FIRST resolution with a reason.
INSERT INTO ho_actions (report_id, resolution_id, action, rejection_reason, actor_user_id, acted_at)
SELECT
  r.id,
  res.id,
  'return'::ho_action_type,
  CASE
    WHEN random() < 0.33 THEN 'Resolution photo does not clearly show the issue was fixed. Please retake from a different angle.'
    WHEN random() < 0.66 THEN 'Note is too brief — please describe the corrective action in more detail and mention any equipment or signage added.'
    ELSE 'This requires a permanent fix, not a workaround. Please escalate to maintenance and re-submit.'
  END,
  NULL,
  res.resolved_at + interval '1 day'
FROM reports r
JOIN LATERAL (
  SELECT id, resolved_at FROM resolutions
  WHERE report_id = r.id AND attempt_number = 1
) res ON TRUE
WHERE r.status = 'returned'
ON CONFLICT DO NOTHING;

-- =========================
-- NOTIFICATION LOG
-- =========================
-- Populate a realistic-looking audit trail so the manager dashboard's "Recent activity"
-- list has data on day one.
INSERT INTO notification_log (report_id, recipient_type, recipient_identifier, channel, event_type, sent_at, delivery_status)
SELECT id, 'manager', (SELECT manager_phone FROM stores WHERE sap_code = r.store_code),
       'push', 'new_report', r.reported_at, 'sent'
FROM reports r;

INSERT INTO notification_log (report_id, recipient_type, recipient_identifier, channel, event_type, sent_at, delivery_status)
SELECT r.id, 'reporter', r.reporter_phone, 'push', 'approved', ha.acted_at, 'sent'
FROM reports r
JOIN ho_actions ha ON ha.report_id = r.id AND ha.action = 'approve'
WHERE r.status = 'closed';

INSERT INTO notification_log (report_id, recipient_type, recipient_identifier, channel, event_type, sent_at, delivery_status)
SELECT r.id, 'manager', (SELECT manager_phone FROM stores WHERE sap_code = r.store_code),
       'push', 'returned', ha.acted_at, 'sent'
FROM reports r
JOIN ho_actions ha ON ha.report_id = r.id AND ha.action = 'return'
WHERE r.status = 'returned';

-- =========================
-- HO USER PROFILE LINK (run manually after creating the auth user)
-- =========================
-- After you create ho@safereport.demo via Supabase Auth → Users → Add User,
-- copy the UUID and run:
--
--   INSERT INTO ho_users (user_id, display_name, role)
--   VALUES ('<PASTE UUID HERE>', 'Demo HO Officer', 'safety_officer')
--   ON CONFLICT (user_id) DO NOTHING;
--
--   -- Backfill actor_user_id on the seeded ho_actions:
--   UPDATE ho_actions SET actor_user_id = '<PASTE UUID HERE>' WHERE actor_user_id IS NULL;
--

-- =========================
-- SANITY CHECK
-- =========================
SELECT
  (SELECT COUNT(*) FROM stores)           AS stores,
  (SELECT COUNT(*) FROM reports)          AS reports,
  (SELECT COUNT(*) FROM resolutions)      AS resolutions,
  (SELECT COUNT(*) FROM ho_actions)       AS ho_actions,
  (SELECT COUNT(*) FROM notification_log) AS notifications;
