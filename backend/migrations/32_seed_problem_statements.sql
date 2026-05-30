-- ════════════════════════════════════════════════════════════════
-- migration 32 — seed ~40 curated problem statements
-- ════════════════════════════════════════════════════════════════
--
-- Hand-curated v1 seed across the four sources the operator picked
-- (SIH, GSoC, Kaggle, MLH/Devfolio/Unstop). Every entry has:
--   - title, full description
--   - 2-3 paragraph how_to_start ("a little way")
--   - official_url (the real page it lives on)
--   - dataset_links + resource_links (where applicable)
--   - tags so the filter UI has something to chew on
--
-- This 40-item seed proves the UX and gives students immediate
-- content to browse. The 1000+ target is reached via the CSV
-- importer at backend/scripts/seedProblems.js — drop a CSV with
-- the documented columns, run the script, watch the table grow.
--
-- IDEMPOTENT — INSERT ... ON CONFLICT (slug) DO NOTHING. Re-running
-- this migration won't duplicate rows.
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.problem_statements
  (slug, title, description, how_to_start, domain, difficulty, organisation, source, source_event, official_url, dataset_links, resource_links, tags)
VALUES

-- ═══════════════════════════════════════════════════════
-- SIH (Smart India Hackathon) — Govt + Industry problems
-- ═══════════════════════════════════════════════════════

('sih-disaster-resource-mapping',
 'Real-time Disaster Resource Mapping Platform',
 'During floods or earthquakes, NGOs and government bodies have no shared view of where relief is needed vs already deployed. Build a map-based platform where verified responders can pin needs (food, medical, evacuation) and other responders can claim them — preventing both duplicate effort and missed pockets.',
 'Start with Leaflet + OpenStreetMap for the base map. Backend can be Node + Postgres with PostGIS for proximity queries. Auth via OTP (Twilio sandbox or Firebase). Build the data model first: needs (lat, lng, type, priority, claimed_by). Add a simple WebSocket layer (socket.io) for real-time updates. For verification, prototype with a manual admin approval queue — the harder problem (proving someone is a legit responder) can be solved later with Aadhaar e-sign integration.',
 'Govt', 'intermediate', 'Ministry of Home Affairs', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[]'::jsonb,
 '[{"label":"Leaflet docs","url":"https://leafletjs.com/","kind":"docs"},{"label":"PostGIS quick start","url":"https://postgis.net/workshops/postgis-intro/","kind":"docs"}]'::jsonb,
 ARRAY['javascript','postgis','maps','realtime','social-impact']),

('sih-crop-disease-detection',
 'Crop Disease Detection from Smartphone Photos',
 'Farmers in tier-3 areas can''t access agricultural extension officers easily. Build an Android app where a farmer photographs a diseased leaf and gets back the likely disease name + organic/chemical treatment options in the local language (Kannada, Hindi, Tamil).',
 'PlantVillage dataset on Kaggle has 50K+ labelled leaf images across 38 disease classes — perfect transfer-learning target. Fine-tune a MobileNetV3 on it (Colab free GPU is enough). Convert to TFLite for on-device inference. Frontend: React Native or Flutter with the camera plugin. For multilingual treatment text, hand-translate the 38 disease entries — far better than a runtime translation API.',
 'AI/ML', 'intermediate', 'Ministry of Agriculture', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[{"label":"PlantVillage dataset","url":"https://www.kaggle.com/datasets/abdallahalidev/plantvillage-dataset","format":"images"}]'::jsonb,
 '[{"label":"MobileNetV3 transfer learning","url":"https://www.tensorflow.org/tutorials/images/transfer_learning","kind":"tutorial"},{"label":"TFLite on Android","url":"https://www.tensorflow.org/lite/android","kind":"docs"}]'::jsonb,
 ARRAY['python','tensorflow','mobile','computer-vision','agriculture']),

('sih-public-transit-eta',
 'ETA prediction for state bus services',
 'Karnataka State Road Transport buses lack accurate ETA — passengers wait 40+ minutes on routes that should be every-15-min. GPS data is available but unused. Build a system that consumes the GPS feed and returns "next bus at stop X in N minutes" via a public API + simple PWA.',
 'KSRTC publishes a GTFS-realtime feed (you''ll need to request access — start there). Train a baseline ETA on historical traffic patterns by hour-of-day + day-of-week. A simple linear regression beats fancy ML for v1. Cache the predictions in Redis with 60s TTL. The hardest part is data cleaning — GPS drops out in tunnels and dense areas; handle that gracefully.',
 'Govt', 'advanced', 'KSRTC (Karnataka)', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[{"label":"GTFS-realtime spec","url":"https://gtfs.org/realtime/","format":"protobuf"}]'::jsonb,
 '[{"label":"GTFS-realtime tutorial","url":"https://developers.google.com/transit/gtfs-realtime","kind":"docs"}]'::jsonb,
 ARRAY['python','gtfs','transit','prediction','public-good']),

('sih-flood-warning-iot',
 'Hyperlocal Flood Early-Warning Network',
 'Existing IMD flood warnings are district-level — too coarse for a city. Design a low-cost ESP32-based water-level sensor (~₹800/unit) that streams data over LoRaWAN to a cloud aggregator, and a citizen-facing PWA that shows colour-coded risk per neighbourhood.',
 'Hardware: ESP32 + JSN-SR04T ultrasonic sensor (waterproof) + a TTGO LoRa32 board. Use TTN (The Things Network) as the LoRaWAN gateway — free tier covers it. Cloud: a Node + InfluxDB stack to receive payloads. PWA reads from InfluxDB via a thin Express API. Start by building ONE sensor, drop it in a measured-depth bucket, validate the readings before scaling.',
 'IoT', 'advanced', 'NDMA (Disaster Management)', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[]'::jsonb,
 '[{"label":"The Things Network docs","url":"https://www.thethingsnetwork.org/docs/","kind":"docs"},{"label":"ESP32 + LoRa tutorial","url":"https://randomnerdtutorials.com/esp32-lora-rfm95-transceiver-arduino-ide/","kind":"tutorial"}]'::jsonb,
 ARRAY['esp32','lorawan','iot','disaster','hardware']),

('sih-sign-language-translator',
 'Real-time ISL → Text Translator',
 'Indian Sign Language has 5M+ users but vanishingly few tech accommodations. Build a webcam-based PWA that recognises ISL signs (single-hand alphabet + 50 common phrases) and renders them as text in real time — usable in classrooms and reception desks.',
 'INCLUDE dataset (IIITH) has 4,287 video clips of 263 ISL signs — start there. MediaPipe Hands gives you 21 keypoints per hand in real time; train a simple LSTM on those keypoint sequences rather than raw video (much smaller model). Web deployment via TensorFlow.js. Begin with alphabet-only as proof of concept, then expand to phrases.',
 'AI/ML', 'advanced', 'Ministry of Social Justice', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[{"label":"INCLUDE ISL dataset","url":"https://zenodo.org/records/4010759","format":"video"}]'::jsonb,
 '[{"label":"MediaPipe Hands","url":"https://google.github.io/mediapipe/solutions/hands","kind":"docs"},{"label":"TensorFlow.js","url":"https://www.tensorflow.org/js","kind":"docs"}]'::jsonb,
 ARRAY['python','tensorflow','mediapipe','accessibility','computer-vision']),

('sih-blockchain-academic-creds',
 'Blockchain-anchored Academic Credentials',
 'A degree certificate forged with a colour printer is indistinguishable from a real one to an HR system. Design a system where universities mint each credential as an ERC-721 NFT on a permissioned chain, and employers verify with a QR scan that resolves to the on-chain anchor.',
 'Don''t use mainnet Ethereum (gas costs make this absurd). Use Polygon Edge or Hyperledger Besu in a permissioned PoA configuration — universities run validator nodes. The cert content itself stays off-chain (IPFS); only the hash gets anchored. Build the QR verifier as a static site so anyone can audit without infrastructure. Solidity + Hardhat for the contract. v1: handle one university, then federate.',
 'Web3', 'advanced', 'Ministry of Education', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[]'::jsonb,
 '[{"label":"Polygon Edge","url":"https://wiki.polygon.technology/docs/edge/overview/","kind":"docs"},{"label":"OpenZeppelin ERC721","url":"https://docs.openzeppelin.com/contracts/4.x/erc721","kind":"docs"}]'::jsonb,
 ARRAY['solidity','polygon','blockchain','credentials','identity']),

('sih-electricity-theft-detection',
 'Detecting Electricity Theft from Smart Meter Data',
 'BESCOM loses ~14% revenue to theft and meter tampering. Smart meters log usage every 15 minutes — given the time-series, detect anomalous consumption patterns that suggest bypass meters or hacking.',
 'Public smart-meter dataset: London Smart Meter (UCI). Train an isolation forest on per-household weekly usage curves to flag outliers. False positives are the bigger concern than misses — every flagged household needs a manual inspection, so calibrate the threshold for ~5% flag rate, not 50%. The interesting twist: theft is often coordinated by season (irrigation pumps in summer), so feature engineer day-of-year.',
 'AI/ML', 'intermediate', 'BESCOM', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[{"label":"London Smart Meter dataset","url":"https://archive.ics.uci.edu/dataset/471/electricityloaddiagrams20112014","format":"csv"}]'::jsonb,
 '[{"label":"sklearn IsolationForest","url":"https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html","kind":"docs"}]'::jsonb,
 ARRAY['python','sklearn','time-series','anomaly-detection','utilities']),

-- ═══════════════════════════════════════════════════════
-- GSoC project ideas — open-source contribution
-- ═══════════════════════════════════════════════════════

('gsoc-postgres-pg-bench-modes',
 'Postgres: Realistic OLTP/OLAP benchmark modes for pgbench',
 'pgbench is the default Postgres benchmarking tool but its built-in scripts simulate a 30-year-old TPC-B workload that no real OLTP system resembles. Implement TPC-C-style and HTAP modes so DBAs can stress-test with workloads that mirror modern applications.',
 'Clone postgres/postgres, look at src/bin/pgbench. Read the existing built-in script implementations (\\set, \\setrandom, etc.). The TPC-C transactions (NewOrder, Payment, Delivery, StockLevel, OrderStatus) are well-specified. Start by writing them in pgbench''s scripting language as an external -f file. Once that works, move into the C codebase to add them as compile-time --tpcc=on flags. Plan to spend the first month reading the source.',
 'OpenSource', 'advanced', 'PostgreSQL Global Development Group', 'GSoC', 'GSoC 2024',
 'https://wiki.postgresql.org/wiki/GSoC_2024',
 '[]'::jsonb,
 '[{"label":"pgbench docs","url":"https://www.postgresql.org/docs/current/pgbench.html","kind":"docs"},{"label":"TPC-C specification","url":"https://www.tpc.org/tpcc/","kind":"docs"},{"label":"postgres source tour","url":"https://www.postgresql.org/developer/sourcecode/","kind":"docs"}]'::jsonb,
 ARRAY['c','postgres','databases','benchmarking','systems']),

('gsoc-rust-clippy-lint',
 'Rust: New clippy lint for iterator misuse',
 'clippy has 600+ lints but every release brings requests for more. Patterns like `.collect::<Vec<_>>().iter()` (redundant collect) or `iter().count()` (use `.len()` when the iterator is `ExactSizeIterator`) are common Rust footguns. Author 3-5 new lints, including the negative tests.',
 'rust-clippy is on GitHub; the contributing docs walk you through `cargo dev new_lint --name foo --pass late --category complexity`. The hardest part isn''t writing the lint — it''s figuring out which AST nodes correspond to the pattern you''re looking for. Read 5 existing lints in the same category before writing yours. The negative-test suite (UI tests in tests/ui/) is where reviewers will push back.',
 'OpenSource', 'intermediate', 'Rust Foundation', 'GSoC', 'GSoC 2024',
 'https://github.com/rust-lang/rust-clippy/blob/master/CONTRIBUTING.md',
 '[]'::jsonb,
 '[{"label":"Clippy lint dev guide","url":"https://doc.rust-lang.org/clippy/development/adding_lints.html","kind":"docs"}]'::jsonb,
 ARRAY['rust','compilers','linting','open-source']),

('gsoc-django-form-improvements',
 'Django: Async-native form validation',
 'Django''s form layer was designed in the synchronous era. With ASGI now first-class, forms should support async clean_<field>() validators (e.g. for DB-backed uniqueness checks under high concurrency).',
 'Read django/forms/forms.py and django/forms/fields.py to map out where clean methods are called. The trickiest design decision: should `is_valid()` stay sync (with async clean methods awaited internally via asyncio.run) or get an async variant? Send a draft DEP (Django Enhancement Proposal) before writing code — the django-developers list will save you a month of misdirected work.',
 'OpenSource', 'advanced', 'Django Software Foundation', 'GSoC', 'GSoC 2024',
 'https://code.djangoproject.com/wiki/SummerOfCode2024',
 '[]'::jsonb,
 '[{"label":"Django forms internals","url":"https://docs.djangoproject.com/en/stable/ref/forms/api/","kind":"docs"},{"label":"DEP process","url":"https://github.com/django/deps","kind":"docs"}]'::jsonb,
 ARRAY['python','django','async','web-frameworks']),

('gsoc-blender-grease-pencil',
 'Blender: Grease Pencil performance under heavy stroke counts',
 'Blender''s Grease Pencil tool (2D animation in 3D space) chokes at ~10K strokes per frame. The current draw path re-uploads every stroke''s GPU buffer per frame. Refactor to use a persistent VBO with dirty-tracking — target 60fps at 50K strokes.',
 'Blender is a C/C++ codebase with Python bindings. Build from source first (CMake; expect a 90-minute clean build). The Grease Pencil draw code lives in source/blender/draw/engines/gpencil/. Profile current behaviour with renderdoc to confirm the buffer re-upload bottleneck. Plan: split static strokes (no animation, can pin the VBO) from animated ones (re-upload required). Talk to @antoniov on devtalk.blender.org early — they''re the maintainer.',
 'OpenSource', 'advanced', 'Blender Foundation', 'GSoC', 'GSoC 2024',
 'https://wiki.blender.org/wiki/GSoC/2024',
 '[]'::jsonb,
 '[{"label":"Blender developer docs","url":"https://wiki.blender.org/wiki/Developer_Intro","kind":"docs"}]'::jsonb,
 ARRAY['c++','blender','graphics','gpu','open-source']),

('gsoc-keycloak-passkeys',
 'Keycloak: Native passkey (WebAuthn) authentication flow',
 'Keycloak supports WebAuthn as a 2FA factor but not as a primary credential. Implement a passkey-only sign-in flow so an org can configure passwordless auth for its users.',
 'Keycloak is Java + Quarkus. The WebAuthn integration lives in services/src/main/java/org/keycloak/credential/WebAuthn*. Start by reading how the current 2FA path constructs the assertion challenge. The primary-credential flow needs (a) a new Required Action that registers the passkey at first login, (b) a new Authenticator that accepts a credential.get() response without a prior password, (c) admin-UI tickboxes for the realm setting.',
 'OpenSource', 'advanced', 'Red Hat / Keycloak', 'GSoC', 'GSoC 2024',
 'https://www.keycloak.org/community',
 '[]'::jsonb,
 '[{"label":"WebAuthn spec","url":"https://www.w3.org/TR/webauthn-2/","kind":"docs"},{"label":"Keycloak SPI guide","url":"https://www.keycloak.org/docs/latest/server_development/","kind":"docs"}]'::jsonb,
 ARRAY['java','quarkus','webauthn','identity','open-source']),

-- ═══════════════════════════════════════════════════════
-- Kaggle — competitions with real datasets
-- ═══════════════════════════════════════════════════════

('kaggle-titanic-survival',
 'Titanic: Survival Prediction (classic baseline)',
 'The 101 of Kaggle. Given passenger data (class, age, sex, fare, embarked) predict who survived. Public leaderboard hovers around 0.78 accuracy; getting past 0.82 separates skill from luck.',
 'Start with pandas to read train.csv, do a 5-minute EDA — Pclass and Sex are the strongest single predictors. Build a baseline with sklearn''s RandomForestClassifier. Feature engineering wins the real points: Title from Name (Mr/Mrs/Master), FamilySize from SibSp+Parch, IsAlone, AgeBin. Cross-validate with StratifiedKFold(5) before submitting — public-LB chasing is the rookie trap.',
 'AI/ML', 'beginner', 'Kaggle', 'Kaggle', null,
 'https://www.kaggle.com/competitions/titanic',
 '[{"label":"Titanic training set","url":"https://www.kaggle.com/competitions/titanic/data","format":"csv"}]'::jsonb,
 '[{"label":"Pandas tutorial","url":"https://pandas.pydata.org/docs/getting_started/index.html","kind":"docs"},{"label":"sklearn cheat sheet","url":"https://scikit-learn.org/stable/tutorial/machine_learning_map/","kind":"docs"}]'::jsonb,
 ARRAY['python','pandas','sklearn','classification','starter']),

('kaggle-house-prices',
 'House Prices: Advanced Regression Techniques',
 'Predict the sale price of 1,460 houses in Ames, Iowa using 79 features (lot size, year built, basement quality, etc.). Top public scores use stacked ensembles + careful feature engineering.',
 'pandas-profiling on the train.csv first — there are 19 features with >20% missing. Don''t naively impute the median; categorical missing-ness is often informative (NA in PoolQC = "no pool"). Log-transform the target (SalePrice) before training — regression metrics are RMSE on log, so heteroskedasticity matters. Baseline: LightGBM with default params, then stack with Ridge + ElasticNet. Reach top-20% before touching XGBoost.',
 'AI/ML', 'intermediate', 'Kaggle', 'Kaggle', null,
 'https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques',
 '[{"label":"House Prices dataset","url":"https://www.kaggle.com/competitions/house-prices-advanced-regression-techniques/data","format":"csv"}]'::jsonb,
 '[{"label":"LightGBM tutorial","url":"https://lightgbm.readthedocs.io/en/latest/Quick-Start.html","kind":"docs"},{"label":"Stacked regression notebook","url":"https://www.kaggle.com/code/serigne/stacked-regressions-top-4-on-leaderboard","kind":"tutorial"}]'::jsonb,
 ARRAY['python','regression','feature-engineering','lightgbm','ensemble']),

('kaggle-nyc-taxi-fare',
 'NYC Taxi Fare Prediction',
 'Predict taxi fares from pickup/dropoff coordinates, timestamp, and passenger count — 55M-row training set, so this is as much an engineering problem as an ML one.',
 'Don''t load the whole CSV into pandas — chunk it or use Dask / DuckDB. Geographic features dominate: distance via Haversine, Manhattan distance, distance to airports (JFK / LGA fare jumps). Time features matter too — rush hour, weekday vs weekend, time of year. A LightGBM on engineered features beats deep learning here for both time-to-train and final RMSE.',
 'AI/ML', 'intermediate', 'Kaggle', 'Kaggle', null,
 'https://www.kaggle.com/competitions/new-york-city-taxi-fare-prediction',
 '[{"label":"NYC Taxi Fare dataset","url":"https://www.kaggle.com/competitions/new-york-city-taxi-fare-prediction/data","format":"csv"}]'::jsonb,
 '[{"label":"DuckDB for analytics","url":"https://duckdb.org/docs/api/python/overview","kind":"docs"},{"label":"Haversine formula","url":"https://en.wikipedia.org/wiki/Haversine_formula","kind":"docs"}]'::jsonb,
 ARRAY['python','duckdb','geospatial','regression','big-data']),

('kaggle-asl-fingerspelling',
 'ASL Fingerspelling Recognition',
 'Recognise American Sign Language fingerspelling from MediaPipe hand-landmark sequences (no raw video). Tests both sequence modelling and the discipline to work with non-image input.',
 'Hand-landmark data means you get 21 keypoints × 3 dims per frame — sequences are 30-200 frames. A small Transformer encoder (4 layers, 128 hidden) beats LSTM-based baselines. Augmentation matters more than model size: spatial jitter on the keypoints, time stretching, mirror flips. Use mixed precision (torch.cuda.amp) — the train set is 67K sequences and you''ll be CPU-IO-bound otherwise.',
 'AI/ML', 'advanced', 'Kaggle / Google', 'Kaggle', null,
 'https://www.kaggle.com/competitions/asl-fingerspelling',
 '[{"label":"ASL Fingerspelling dataset","url":"https://www.kaggle.com/competitions/asl-fingerspelling/data","format":"parquet"}]'::jsonb,
 '[{"label":"PyTorch Transformer tutorial","url":"https://pytorch.org/tutorials/beginner/transformer_tutorial.html","kind":"tutorial"},{"label":"MediaPipe Hands","url":"https://google.github.io/mediapipe/solutions/hands","kind":"docs"}]'::jsonb,
 ARRAY['python','pytorch','transformers','sequence-modelling','accessibility']),

('kaggle-credit-card-fraud',
 'Credit Card Fraud Detection',
 'Detect fraudulent transactions in a heavily imbalanced dataset (0.17% fraud). The challenge is precision/recall at extreme class imbalance, not classifier accuracy.',
 'Accuracy is meaningless here — predict all-not-fraud and you''re at 99.8%. Optimise for PR-AUC (precision-recall area-under-curve). Try (a) class weights in LightGBM, (b) SMOTE oversampling — and compare honestly with stratified CV. The PCA-transformed features (V1-V28) are weirdly engineered to anonymise the original variables; don''t try to reverse them, just use them.',
 'AI/ML', 'intermediate', 'Kaggle / ULB', 'Kaggle', null,
 'https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud',
 '[{"label":"Credit Card Fraud dataset","url":"https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud","format":"csv"}]'::jsonb,
 '[{"label":"imbalanced-learn (SMOTE)","url":"https://imbalanced-learn.org/stable/","kind":"docs"},{"label":"PR-AUC explanation","url":"https://scikit-learn.org/stable/auto_examples/model_selection/plot_precision_recall.html","kind":"tutorial"}]'::jsonb,
 ARRAY['python','imbalanced','fraud','finance','classification']),

('kaggle-leaf-classification',
 'Leaf Species Classification',
 'Classify 99 species of leaves from binary images + 64-dimensional pre-extracted feature vectors. Small enough dataset that a careful sklearn pipeline beats deep learning.',
 'You get THREE feature sets per leaf (margin, shape, texture) — 64 dims each. Train one model per feature set, ensemble the predictions. Logistic Regression + a small KNN works surprisingly well. The dataset is small (990 train) so a CNN on the raw images will overfit; if you do go CNN, freeze a pretrained backbone (ResNet18) and only train the final layer.',
 'AI/ML', 'beginner', 'Kaggle', 'Kaggle', null,
 'https://www.kaggle.com/competitions/leaf-classification',
 '[{"label":"Leaf Classification dataset","url":"https://www.kaggle.com/competitions/leaf-classification/data","format":"csv+images"}]'::jsonb,
 '[{"label":"sklearn pipelines","url":"https://scikit-learn.org/stable/modules/compose.html","kind":"docs"}]'::jsonb,
 ARRAY['python','sklearn','classification','starter','botany']),

('kaggle-tabular-playground-mar',
 'Tabular Playground — March (synthetic tabular regression)',
 'Monthly synthetic dataset designed to stress-test tabular ML pipelines. ~300K rows, 30 features. Public leaderboard separates by 4 decimal places — small improvements matter.',
 'Don''t deep-dive feature engineering on a synthetic dataset; the signal is mostly in interactions. CatBoost with default params is a strong baseline. Then stack a few different seeds of LightGBM. Optuna for hyperparameter search beats hand-tuning. Holdout 10% for a local CV that mirrors the public LB — public LB chasing has stolen weekends from better engineers than you.',
 'AI/ML', 'intermediate', 'Kaggle', 'Kaggle', null,
 'https://www.kaggle.com/competitions/tabular-playground-series-mar-2022',
 '[]'::jsonb,
 '[{"label":"CatBoost docs","url":"https://catboost.ai/en/docs/","kind":"docs"},{"label":"Optuna","url":"https://optuna.readthedocs.io/","kind":"docs"}]'::jsonb,
 ARRAY['python','catboost','optuna','tabular','regression']),

-- ═══════════════════════════════════════════════════════
-- MLH / Devfolio / Unstop — hackathon problem archives
-- ═══════════════════════════════════════════════════════

('mlh-best-use-of-mongodb',
 'MLH: Best Use of MongoDB Atlas',
 'Generic challenge that runs at every Major League Hacking event: ship a project that uses MongoDB Atlas in a substantive way (not just storing { name, age } documents).',
 'Pick a use case that MongoDB''s document model actually wins at: nested social feeds, event sourcing, real-time IoT telemetry, or geo-spatial search. Use Atlas Search ($search aggregation stage) — judges underweight projects that ignore the actual differentiating features. The Vector Search feature (Atlas vector indexes) is the 2024 hot-button — pair it with an LLM and you''re in the top 5 by default.',
 'Web', 'beginner', 'MongoDB', 'MLH', null,
 'https://mlh.io/prizes',
 '[]'::jsonb,
 '[{"label":"Atlas Search docs","url":"https://www.mongodb.com/docs/atlas/atlas-search/","kind":"docs"},{"label":"Atlas Vector Search","url":"https://www.mongodb.com/docs/atlas/atlas-vector-search/","kind":"docs"}]'::jsonb,
 ARRAY['javascript','mongodb','full-stack','hackathon']),

('devfolio-eth-india-dao',
 'EthIndia: DAO governance for a real community',
 'EthIndia consistently rewards DAO infrastructure projects that solve a real coordination problem — not toy voting demos. Pick a community you''re part of (a club, a neighbourhood, a Twitter circle) and build the smart-contract layer they''d actually use.',
 'Use Snapshot for off-chain voting (free, real, gas-less) instead of building on-chain governance from scratch — judges respect knowing when not to reinvent. Where on-chain matters: treasury (multisig via Safe), membership NFTs (ERC-721 with non-transferable flag), and proposal execution (Gnosis Safe + Zodiac modules). Build a focused frontend that ONLY does the thing your community needs — don''t recreate Tally.',
 'Web3', 'advanced', 'Ethereum Foundation', 'Devfolio', 'EthIndia 2024',
 'https://devfolio.co/projects',
 '[]'::jsonb,
 '[{"label":"Snapshot docs","url":"https://docs.snapshot.org/","kind":"docs"},{"label":"Safe (multisig)","url":"https://docs.safe.global/","kind":"docs"},{"label":"Zodiac modules","url":"https://zodiac.wiki/","kind":"docs"}]'::jsonb,
 ARRAY['solidity','dao','governance','ethereum','community']),

('unstop-deloitte-tax-classifier',
 'Unstop x Deloitte: Tax Document Classifier',
 'Given a folder of mixed PDFs (Form 16, ITR, GST returns, bank statements, salary slips, investment proofs), automatically label each one and extract the key fields. Real Deloitte teams do this manually today.',
 'OCR layer first — Tesseract works for typed forms; for handwritten / poor-quality scans use PaddleOCR. Classification can be either (a) keyword-based rules per form type (fast, brittle) or (b) a fine-tuned LayoutLMv3 (slow, robust). For a hackathon, start with rules + a confidence score, and add LayoutLM only if you have time. The judges care about the END-TO-END pipeline running on their test PDFs, not your training metrics.',
 'AI/ML', 'advanced', 'Deloitte', 'Unstop', 'Deloitte AI Challenge 2024',
 'https://unstop.com/hackathons',
 '[]'::jsonb,
 '[{"label":"PaddleOCR","url":"https://github.com/PaddlePaddle/PaddleOCR","kind":"repo"},{"label":"LayoutLMv3","url":"https://huggingface.co/microsoft/layoutlmv3-base","kind":"docs"}]'::jsonb,
 ARRAY['python','ocr','layoutlm','document-ai','finance']),

('mlh-best-domain-name',
 'MLH: Best .tech Domain Name (creative)',
 'The most-won MLH challenge of all time. Register a creative .tech domain and use it for your hackathon project landing page. Low effort, free swag.',
 'Skip the obvious puns. Look at what your project actually does and find a 2-syllable name that describes the CORE verb (mintit.tech, vouchfor.tech). Use Vercel for free hosting + a custom domain. Add an Open Graph image — it''s the only thing visible in the project gallery thumbnail.',
 'Web', 'beginner', '.tech Domains', 'MLH', null,
 'https://mlh.io/prizes',
 '[]'::jsonb,
 '[{"label":".tech Free domain for MLH","url":"https://get.tech/mlh","kind":"docs"},{"label":"Vercel custom domains","url":"https://vercel.com/docs/projects/domains","kind":"docs"}]'::jsonb,
 ARRAY['marketing','hackathon','vercel','quick-win']),

('devfolio-polygon-impact',
 'Polygon: Social Impact Web3 dApp',
 'Polygon sponsors run a recurring social-impact track. Past winners: carbon-credit DAOs, micro-grant distribution to rural artisans, NFT-anchored medical records. The bar is a working flow on testnet (Polygon Amoy), not a polished UI.',
 'Skip Layer-1 for cost — Polygon Amoy testnet is free and fast. Use thirdweb or scaffold-eth-2 to skip wallet plumbing. For the impact angle, partner with a real NGO during the hack — judges weight "we talked to actual users" 5x more than "we have a deck". Document the user flow as a 90-sec video; a dApp judged on a screenshot loses to one judged on a flow.',
 'Web3', 'intermediate', 'Polygon Labs', 'Devfolio', null,
 'https://devfolio.co/projects',
 '[]'::jsonb,
 '[{"label":"thirdweb","url":"https://portal.thirdweb.com/","kind":"docs"},{"label":"scaffold-eth-2","url":"https://docs.scaffoldeth.io/","kind":"docs"}]'::jsonb,
 ARRAY['solidity','polygon','social-impact','dao']),

-- ═══════════════════════════════════════════════════════
-- Open Source (evergreen, not tied to a specific event)
-- ═══════════════════════════════════════════════════════

('os-rebuild-redis-mini',
 'Build your own Redis (single-node, in C or Rust)',
 'A canonical learn-systems-deeply project. Implement a subset of Redis: GET/SET/DEL with TTLs, a hash and list type, RESP protocol parsing, and a single-threaded event loop.',
 'Use Tsoding''s "Build your own Redis" stream or the "Coding Challenges" guide as a guardrail. Start with TCP server accepting raw bytes — don''t reach for a parser library. RESP is a stupidly simple line protocol; reading the Redis docs while you implement it forces you to actually understand it. Hash and list are easy after GET/SET works. The fun bit is the event loop — single-threaded, epoll/kqueue based, no async runtime.',
 'OpenSource', 'advanced', 'Self-directed', 'OpenSource', null,
 'https://codingchallenges.fyi/challenges/challenge-redis',
 '[]'::jsonb,
 '[{"label":"RESP protocol spec","url":"https://redis.io/docs/latest/develop/reference/protocol-spec/","kind":"docs"},{"label":"Coding Challenges: Redis","url":"https://codingchallenges.fyi/challenges/challenge-redis","kind":"tutorial"}]'::jsonb,
 ARRAY['c','rust','systems','networking','protocols']),

('os-llvm-pass-tutorial',
 'Write an LLVM pass that finds unused function arguments',
 'Authoring an LLVM compiler pass is the cleanest way to learn how modern compilers work. A pass that walks every function and flags arguments never used inside the body is the canonical "first pass" assignment.',
 'Install LLVM from source (not the package manager — you need libLLVM dev headers). Read the "Writing an LLVM Pass" tutorial. Implement as a FunctionPass — for each function, iterate its arguments, and for each, check whether the use_list() is empty. Run it on a tiny C program compiled with -emit-llvm to see the IR. The trickiest bit is the build system (CMake + LLVM''s find_package).',
 'OpenSource', 'advanced', 'LLVM', 'OpenSource', null,
 'https://llvm.org/docs/WritingAnLLVMPass.html',
 '[]'::jsonb,
 '[{"label":"Writing an LLVM Pass","url":"https://llvm.org/docs/WritingAnLLVMPass.html","kind":"docs"},{"label":"Adrian Sampson''s LLVM tutorial","url":"https://www.cs.cornell.edu/~asampson/blog/llvm.html","kind":"tutorial"}]'::jsonb,
 ARRAY['c++','llvm','compilers','systems']),

('os-jepsen-style-test',
 'Jepsen-style consistency test for a distributed KV store',
 'Pick an open-source distributed KV (etcd, Consul, FoundationDB) and write a Jepsen-style test that subjects it to network partitions, clock skew, and process kills — see if it actually holds the consistency level it advertises.',
 'Jepsen itself is in Clojure; the framework runs your operations across N nodes, partitions / unpartitions, and replays the history through a model checker. Read Kyle Kingsbury''s posts before writing code — they''re both a tutorial and the prior art for what tests are interesting. Start with etcd (simplest); the test is essentially: spin up 5 nodes, hammer them with writes, partition randomly, then ask "did any client see a stale linearisable read?". Plan for 2 weeks just to read.',
 'OpenSource', 'advanced', 'Jepsen (Kyle Kingsbury)', 'OpenSource', null,
 'https://github.com/jepsen-io/jepsen',
 '[]'::jsonb,
 '[{"label":"Jepsen repo","url":"https://github.com/jepsen-io/jepsen","kind":"repo"},{"label":"Aphyr''s Jepsen posts","url":"https://aphyr.com/tags/jepsen","kind":"tutorial"}]'::jsonb,
 ARRAY['clojure','distributed-systems','testing','consistency']),

('os-static-site-from-scratch',
 'Static site generator from scratch (no Jekyll/Hugo)',
 'Build a minimal SSG: a Markdown-to-HTML compiler that handles frontmatter, a template engine, and an incremental build. A weekend project that teaches you how every tool you use (Hugo, Astro, Eleventy) actually works.',
 'Pick a language (Go and Rust both make this enjoyable). Use a Markdown parser library (don''t write one — that''s a different project). Frontmatter is YAML at the top of every .md file. Templates: pick the language''s built-in (text/template in Go, askama in Rust). Incremental build = stat the source files, only rebuild ones newer than their output. Stretch goal: a `--watch` mode with file-system events.',
 'OpenSource', 'intermediate', 'Self-directed', 'OpenSource', null,
 'https://www.fullstackpython.com/static-site-generator.html',
 '[]'::jsonb,
 '[{"label":"Go text/template","url":"https://pkg.go.dev/text/template","kind":"docs"},{"label":"Markdown parsers in Rust","url":"https://crates.io/keywords/markdown","kind":"docs"}]'::jsonb,
 ARRAY['go','rust','compilers','tooling','static-site']),

('os-tiny-react',
 'Re-implement React in 200 lines (fiber, reconciliation, hooks)',
 'Every working frontend dev should once have implemented their own version of React. The reconciliation algorithm, the fiber architecture, and the hooks linked-list are easier to understand once you''ve built them.',
 'Read Rodrigo Pombo''s "Build your own React" first — it gives you the skeleton in ~400 lines. Once you''ve walked through it, throw it away and rewrite from scratch with no reference. The aha moments: (1) JSX desugars to nested function calls, (2) the fiber tree is a linked list, not a tree (workInProgress and child pointers), (3) hooks work via a per-fiber index counter that''s reset before each render. Use a simple counter example as your test app.',
 'OpenSource', 'intermediate', 'Self-directed', 'OpenSource', null,
 'https://pomb.us/build-your-own-react/',
 '[]'::jsonb,
 '[{"label":"Build your own React","url":"https://pomb.us/build-your-own-react/","kind":"tutorial"},{"label":"React fiber explained","url":"https://github.com/acdlite/react-fiber-architecture","kind":"docs"}]'::jsonb,
 ARRAY['javascript','react','frontend','internals']),

('os-build-your-own-x',
 'Pick any item from "build-your-own-X" and ship it',
 'codecrafters.io and danistefanovic/build-your-own-x curate hundreds of "build your own [database / interpreter / git / shell / docker]" tutorials. Pick one, finish it, and write up what surprised you.',
 'The mistake here is picking 5 and finishing 0. Commit to exactly one project; budget 40 hours total. Git is a great starter — a working version of `git add` + `git commit` + `git log` is ~300 lines of Python and teaches you content-addressable storage. Write a 1000-word blog post when done (the writeup is the deliverable that lands the internship).',
 'OpenSource', 'beginner', 'Self-directed', 'OpenSource', null,
 'https://github.com/codecrafters-io/build-your-own-x',
 '[]'::jsonb,
 '[{"label":"build-your-own-x list","url":"https://github.com/codecrafters-io/build-your-own-x","kind":"docs"},{"label":"codecrafters challenges","url":"https://codecrafters.io/","kind":"docs"}]'::jsonb,
 ARRAY['systems','learning','portfolio','any-language']),

-- ═══════════════════════════════════════════════════════
-- More SIH — broader coverage
-- ═══════════════════════════════════════════════════════

('sih-fake-news-detection-regional',
 'Fake News Detection for Regional Indian Languages',
 'Existing fake-news classifiers work on English text. Build one that handles Kannada, Tamil, Hindi, and Bengali — the languages WhatsApp misinformation actually spreads in.',
 'IndicBERT (AI4Bharat) is the right starting backbone — pretrained on 12 Indian languages, beats mBERT on every benchmark. Fine-tune on the Hindi-Hostile dataset for the Hindi half; for the others, you''ll need to scrape labelled data from fact-checking sites (BoomLive Kannada, AltNews regional). Build a Chrome extension that flags suspicious forwards — that''s the deliverable that wins judges over.',
 'AI/ML', 'advanced', 'Ministry of I&B', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[{"label":"IndicNLP corpus","url":"https://github.com/AI4Bharat/IndicNLP","format":"text"}]'::jsonb,
 '[{"label":"IndicBERT","url":"https://huggingface.co/ai4bharat/indic-bert","kind":"docs"}]'::jsonb,
 ARRAY['python','nlp','indic-languages','misinformation','huggingface']),

('sih-aadhaar-mask-validator',
 'Aadhaar Privacy: Detect Unmasked Aadhaar in Public Documents',
 'Government departments routinely upload Aadhaar-bearing documents to public sites with the number unmasked — a privacy disaster. Build a tool that scans a PDF / image and either masks the 12-digit Aadhaar automatically or flags the doc for human review.',
 'PDF text extraction with pdfminer.six; for image-only PDFs, OCR with PaddleOCR. Regex for the Aadhaar shape (12 digits, often in groups of 4) is the dumb-but-effective approach. Validate with the Verhoeff checksum (Aadhaar uses it) to cut false positives — random 12-digit strings rarely pass it. Output: redacted PDF + a report of where each match was found.',
 'AI/ML', 'intermediate', 'UIDAI', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[]'::jsonb,
 '[{"label":"pdfminer.six","url":"https://pdfminersix.readthedocs.io/","kind":"docs"},{"label":"Verhoeff checksum","url":"https://en.wikipedia.org/wiki/Verhoeff_algorithm","kind":"docs"}]'::jsonb,
 ARRAY['python','privacy','ocr','pdf','regex']),

('sih-river-water-quality',
 'Predicting River Water Quality from Satellite + Sensor Data',
 'CPCB monitors only 4,500 of India''s ~12,000 river km. Build a model that estimates BOD / DO / pH for unmonitored stretches by combining Sentinel-2 satellite imagery (multispectral) with the sparse ground-truth sensor data.',
 'Sentinel-2 imagery is free via Copernicus Open Access Hub. Bands 2, 3, 4, 5, 6 carry water-quality signal — turbidity in B5, chlorophyll in B6. Train a UNet that takes a 10-band patch and outputs the 3 quality variables. Sparse ground truth means semi-supervised — use CPCB stations as anchor points and propagate via the satellite-pixel covariance.',
 'AI/ML', 'advanced', 'Central Pollution Control Board', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[{"label":"Sentinel-2 access","url":"https://scihub.copernicus.eu/","format":"geotiff"},{"label":"CPCB water-quality data","url":"https://cpcb.nic.in/water-quality/","format":"csv"}]'::jsonb,
 '[{"label":"sentinelsat (Python)","url":"https://sentinelsat.readthedocs.io/","kind":"docs"},{"label":"UNet for satellite","url":"https://github.com/qubvel/segmentation_models.pytorch","kind":"repo"}]'::jsonb,
 ARRAY['python','remote-sensing','unet','environment','geospatial']),

('sih-handwriting-historical-mss',
 'OCR for Historical Sanskrit / Devanagari Manuscripts',
 'Sanskrit manuscripts in palm-leaf and birch-bark archives are deteriorating faster than they''re being transcribed. Build an OCR pipeline that handles old Devanagari + Brahmi scripts despite the ink bleed, page curl, and character variation.',
 'Modern OCR (Tesseract, PaddleOCR) collapses on historical scripts because the training corpus is mostly typed text. You''ll need to fine-tune. Start with the IndicScripts dataset (IIITH); annotate a few hundred manuscript samples by hand. A CTC-loss CNN-RNN (CRNN) on 32-pixel-tall line images is the right architecture for handwriting OCR. Synthetic data generation (apply page-aged texture filters to typed text) doubles your training set.',
 'AI/ML', 'advanced', 'Ministry of Culture', 'SIH', 'SIH 2024',
 'https://www.sih.gov.in/sih2024PS',
 '[]'::jsonb,
 '[{"label":"PaddleOCR","url":"https://github.com/PaddlePaddle/PaddleOCR","kind":"repo"},{"label":"CRNN explanation","url":"https://arxiv.org/abs/1507.05717","kind":"paper"}]'::jsonb,
 ARRAY['python','ocr','historical','sanskrit','heritage']),

-- ═══════════════════════════════════════════════════════
-- More GSoC — different orgs / languages
-- ═══════════════════════════════════════════════════════

('gsoc-jupyter-multi-kernel',
 'Jupyter: Multi-language kernel coordination',
 'Jupyter notebooks support one kernel per notebook today — but data science work often mixes Python + R + SQL in the same analysis. Implement a "polyglot" mode where one notebook holds multiple kernels and a cell selects which one runs it.',
 'Read the existing Kernel protocol (ZMQ-based). The notebook frontend (JupyterLab) needs a kernel picker per cell. Implementation could either (a) extend jupyter_client to manage multiple sub-kernels under one notebook, or (b) add a meta-kernel that proxies to others — both have precedent. Read the SoS (Script of Scripts) extension to see prior art before designing.',
 'OpenSource', 'advanced', 'Project Jupyter', 'GSoC', 'GSoC 2024',
 'https://jupyter.org/about',
 '[]'::jsonb,
 '[{"label":"Jupyter messaging protocol","url":"https://jupyter-client.readthedocs.io/en/stable/messaging.html","kind":"docs"},{"label":"SoS kernel","url":"https://vatlab.github.io/sos-docs/","kind":"docs"}]'::jsonb,
 ARRAY['python','jupyter','protocols','data-science','open-source']),

('gsoc-godot-physics',
 'Godot Engine: Faster broadphase for 2D physics',
 'Godot 4''s 2D physics broadphase uses an axis-aligned BVH that rebuilds per frame — fine up to ~5K bodies, terrible past 50K. Implement a chunked sweep-and-prune that scales linearly.',
 'Godot is a large C++ codebase but the physics module is relatively self-contained. Look at servers/physics_2d/. Implement the new broadphase as an opt-in setting first (don''t change defaults until benchmarked). Build a stress-test scene with N spawned bodies — that''s your benchmark. Talk to @clayjohn (physics maintainer) before writing the proposal — they''ll tell you about the constraints you''d only learn by hitting them.',
 'OpenSource', 'advanced', 'Godot Engine', 'GSoC', 'GSoC 2024',
 'https://godotengine.org/community',
 '[]'::jsonb,
 '[{"label":"Godot dev docs","url":"https://docs.godotengine.org/en/stable/contributing/development/","kind":"docs"},{"label":"Broadphase algorithms","url":"https://en.wikipedia.org/wiki/Sweep_and_prune","kind":"docs"}]'::jsonb,
 ARRAY['c++','godot','games','physics','open-source']),

-- ═══════════════════════════════════════════════════════
-- More Kaggle / data
-- ═══════════════════════════════════════════════════════

('kaggle-airbnb-eda',
 'Inside Airbnb: Open data EDA',
 'Inside Airbnb publishes scraped Airbnb listing data for 100+ cities. Pick a city, do a thorough EDA, find one non-obvious story.',
 'This isn''t a model-training exercise — judges of EDA work want a STORY. Examples that have worked: "neighbourhoods with rising listing counts predict property-price spikes 6 months later"; "superhost ratings are systematically inflated vs review sentiment"; "single-listing hosts (genuine spare-room) vs commercial multi-listing operators". Use pandas + plotly. The deliverable is a notebook + 1-paragraph executive summary at the top.',
 'AI/ML', 'beginner', 'Inside Airbnb (open data)', 'Kaggle', null,
 'http://insideairbnb.com/get-the-data/',
 '[{"label":"Inside Airbnb data dumps","url":"http://insideairbnb.com/get-the-data/","format":"csv"}]'::jsonb,
 '[{"label":"plotly tutorial","url":"https://plotly.com/python/","kind":"docs"}]'::jsonb,
 ARRAY['python','pandas','plotly','eda','open-data']),

('kaggle-gan-faces',
 'StyleGAN faces: train your own',
 'Train a StyleGAN3 from scratch on a face dataset. The output is one good portrait; the journey is everything you learn about generative models, GPU memory, training stability, and FID.',
 'Use FFHQ at 256×256 (256 is enough; 1024 is for institutions with 16x A100s). StyleGAN3 official repo is in PyTorch. You''ll need at least an RTX 4070 (12 GB) — Kaggle / Colab Pro give that. Training takes 3-7 days. Monitor FID every 1K steps; if it stops dropping for 20K steps, training has stalled. Read Karras et al.''s paper at least twice — half the tricks are in the appendix.',
 'AI/ML', 'advanced', 'NVIDIA / FFHQ', 'Kaggle', null,
 'https://github.com/NVlabs/stylegan3',
 '[{"label":"FFHQ dataset","url":"https://github.com/NVlabs/ffhq-dataset","format":"images"}]'::jsonb,
 '[{"label":"StyleGAN3 repo","url":"https://github.com/NVlabs/stylegan3","kind":"repo"},{"label":"StyleGAN3 paper","url":"https://arxiv.org/abs/2106.12423","kind":"paper"}]'::jsonb,
 ARRAY['python','pytorch','gan','generative','deep-learning']),

-- ═══════════════════════════════════════════════════════
-- More MLH / Devfolio / Unstop
-- ═══════════════════════════════════════════════════════

('mlh-best-use-of-google-cloud',
 'MLH: Best Use of Google Cloud',
 'Recurring MLH challenge sponsored by Google. Build a project that uses one or more GCP services in a way that''s actually load-bearing for the project.',
 'The cheapest-to-impressive ratio is Vertex AI''s Gemini API + Cloud Run. A Gemini-powered chatbot deployed to Cloud Run with the Gemini API talking to Cloud SQL is 200 lines of code and ticks every "best use of GCP" box. Avoid services you don''t use the value-add of — naming a project that "uses Pub/Sub" when a single setInterval would have worked is the rookie mistake.',
 'Web', 'beginner', 'Google Cloud', 'MLH', null,
 'https://mlh.io/prizes',
 '[]'::jsonb,
 '[{"label":"Gemini API","url":"https://ai.google.dev/gemini-api/docs","kind":"docs"},{"label":"Cloud Run","url":"https://cloud.google.com/run/docs","kind":"docs"}]'::jsonb,
 ARRAY['javascript','python','gcp','cloud','ai']),

('unstop-flipkart-grid',
 'Flipkart Grid: Logistics route optimisation',
 'Flipkart Grid (their hiring hackathon) consistently runs a logistics challenge: given a set of orders + delivery locations + warehouse positions, produce a routing plan that minimises total delivery time under driver-shift constraints.',
 'This is VRP (Vehicle Routing Problem) — NP-hard at scale. For a hackathon, OR-Tools (Google''s C++ library with Python bindings) is the correct tool — don''t roll your own. Define the constraints: vehicle capacity, driver hours, time-windowed deliveries. Visualise the routes on Leaflet so judges can SEE the optimisation working. The winning trick: solve a smaller relaxation first, then refine.',
 'AI/ML', 'advanced', 'Flipkart', 'Unstop', 'Flipkart Grid 6.0',
 'https://unstop.com/hackathons',
 '[]'::jsonb,
 '[{"label":"OR-Tools VRP","url":"https://developers.google.com/optimization/routing","kind":"docs"},{"label":"VRP variants","url":"https://en.wikipedia.org/wiki/Vehicle_routing_problem","kind":"docs"}]'::jsonb,
 ARRAY['python','or-tools','optimisation','logistics','npc']),

('devfolio-walrus-decentralised-storage',
 'Walrus: Decentralised storage for an existing dApp',
 'Walrus (Mysten Labs) is the Sui-ecosystem decentralised storage layer. Take any dApp where uploads currently land on centralised storage (Imgur, S3) and port them to Walrus.',
 'Walrus is conceptually similar to IPFS but with built-in erasure coding and on-chain incentives. Sign up for a Walrus testnet endpoint. The integration is two lines on the upload path and two lines on the read path — the dApp''s frontend code barely changes. The interesting part is the failure modes: how does your UI react when Walrus is mid-rebalance? Document that flow in your demo video.',
 'Web3', 'intermediate', 'Mysten Labs (Sui)', 'Devfolio', null,
 'https://devfolio.co/projects',
 '[]'::jsonb,
 '[{"label":"Walrus docs","url":"https://docs.walrus.site/","kind":"docs"}]'::jsonb,
 ARRAY['sui','walrus','decentralised-storage','web3'])

ON CONFLICT (slug) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- Verify
-- ════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS seeded_count FROM public.problem_statements;
