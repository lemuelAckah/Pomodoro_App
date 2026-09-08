export type Group = {
  id: string
  name: string
  category: string
  emoji: string
  description: string
  members: number
  tags: string[]
  color: string
}

export type Category = {
  id: string
  label: string
  emoji: string
}

export const CATEGORIES: Category[] = [
  { id: 'all', label: 'All Subjects', emoji: '🌐' },
  { id: 'mathematics', label: 'Mathematics', emoji: '📐' },
  { id: 'physics', label: 'Physics', emoji: '⚛️' },
  { id: 'chemistry', label: 'Chemistry', emoji: '🧪' },
  { id: 'biology', label: 'Biology', emoji: '🧬' },
  { id: 'earth', label: 'Earth & Space', emoji: '🌍' },
  { id: 'cs', label: 'Computer Science', emoji: '💻' },
  { id: 'engineering', label: 'Engineering', emoji: '⚙️' },
  { id: 'medicine', label: 'Medicine & Health', emoji: '🏥' },
  { id: 'social', label: 'Social Sciences', emoji: '🤝' },
  { id: 'humanities', label: 'Humanities', emoji: '📜' },
  { id: 'languages', label: 'Languages', emoji: '🗣️' },
  { id: 'arts', label: 'Arts & Design', emoji: '🎨' },
  { id: 'business', label: 'Business', emoji: '📊' },
  { id: 'law', label: 'Law', emoji: '⚖️' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'agriculture', label: 'Agriculture & Food', emoji: '🌾' },
  { id: 'architecture', label: 'Architecture', emoji: '🏛️' },
  { id: 'psychology', label: 'Psychology', emoji: '🧠' },
  { id: 'philosophy', label: 'Philosophy', emoji: '🔮' },
  { id: 'sports', label: 'Sports Science', emoji: '🏃' },
  { id: 'environment', label: 'Environmental Studies', emoji: '🌿' },
  { id: 'media', label: 'Media & Communication', emoji: '📡' },
  { id: 'theology', label: 'Theology & Religion', emoji: '✝️' },
  { id: 'military', label: 'Military & Security', emoji: '🛡️' },
]

export const GROUPS: Group[] = [
  // ── MATHEMATICS ──
  { id: 'pure-math', name: 'Pure Mathematics', category: 'mathematics', emoji: '∞', description: 'Abstract algebra, topology, number theory, and the beauty of math for its own sake.', members: 4210, tags: ['algebra', 'topology', 'proofs'], color: '#6366f1' },
  { id: 'calculus', name: 'Calculus & Analysis', category: 'mathematics', emoji: '∫', description: 'Derivatives, integrals, real analysis, and the foundations of continuous mathematics.', members: 8830, tags: ['calculus', 'analysis', 'limits'], color: '#6366f1' },
  { id: 'statistics', name: 'Statistics & Probability', category: 'mathematics', emoji: '📊', description: 'Hypothesis testing, distributions, Bayesian inference, and data-driven reasoning.', members: 6120, tags: ['stats', 'probability', 'data'], color: '#6366f1' },
  { id: 'linear-algebra', name: 'Linear Algebra', category: 'mathematics', emoji: '🔢', description: 'Vectors, matrices, eigenvalues, and the geometry of higher-dimensional spaces.', members: 5440, tags: ['matrices', 'vectors', 'eigenvectors'], color: '#6366f1' },
  { id: 'number-theory', name: 'Number Theory', category: 'mathematics', emoji: '🔢', description: 'Primes, congruences, Diophantine equations, and the deep secrets of integers.', members: 2110, tags: ['primes', 'integers', 'cryptography'], color: '#6366f1' },
  { id: 'discrete-math', name: 'Discrete Mathematics', category: 'mathematics', emoji: '🕸️', description: 'Graph theory, combinatorics, logic, and the math behind computation.', members: 4780, tags: ['graphs', 'combinatorics', 'logic'], color: '#6366f1' },
  { id: 'applied-math', name: 'Applied Mathematics', category: 'mathematics', emoji: '🔧', description: 'Differential equations, numerical methods, and math in real-world systems.', members: 3950, tags: ['odes', 'pdes', 'modelling'], color: '#6366f1' },
  { id: 'actuarial', name: 'Actuarial Science', category: 'mathematics', emoji: '📈', description: 'Risk, insurance mathematics, and financial modeling for actuarial exams.', members: 1890, tags: ['risk', 'insurance', 'exams'], color: '#6366f1' },

  // ── PHYSICS ──
  { id: 'classical-mech', name: 'Classical Mechanics', category: 'physics', emoji: '🔩', description: 'Newton\'s laws, Lagrangian dynamics, and the mechanics of everyday motion.', members: 5230, tags: ['mechanics', 'dynamics', 'kinematics'], color: '#0ea5e9' },
  { id: 'quantum', name: 'Quantum Physics', category: 'physics', emoji: '⚛️', description: 'Wave functions, Schrödinger\'s equation, entanglement, and the quantum world.', members: 9120, tags: ['quantum', 'wavefunctions', 'qm'], color: '#0ea5e9' },
  { id: 'electromagnetism', name: 'Electromagnetism', category: 'physics', emoji: '⚡', description: 'Maxwell\'s equations, electric and magnetic fields, optics, and EM waves.', members: 4660, tags: ['maxwell', 'fields', 'optics'], color: '#0ea5e9' },
  { id: 'thermodynamics', name: 'Thermodynamics', category: 'physics', emoji: '🔥', description: 'Entropy, heat engines, statistical mechanics, and the laws of energy.', members: 3880, tags: ['entropy', 'heat', 'stat-mech'], color: '#0ea5e9' },
  { id: 'relativity', name: 'Relativity', category: 'physics', emoji: '🌌', description: 'Special and general relativity, spacetime curvature, and Einstein\'s framework.', members: 6740, tags: ['einstein', 'spacetime', 'gr'], color: '#0ea5e9' },
  { id: 'astrophysics', name: 'Astrophysics', category: 'physics', emoji: '🌠', description: 'Stars, black holes, neutron stars, and the physics of cosmic objects.', members: 7890, tags: ['stars', 'blackholes', 'cosmology'], color: '#0ea5e9' },
  { id: 'particle-physics', name: 'Particle Physics', category: 'physics', emoji: '🔬', description: 'The Standard Model, quarks, leptons, bosons, and the LHC frontier.', members: 3210, tags: ['standard-model', 'quarks', 'higgs'], color: '#0ea5e9' },
  { id: 'condensed-matter', name: 'Condensed Matter', category: 'physics', emoji: '🧊', description: 'Superconductivity, semiconductors, phase transitions, and solid-state phenomena.', members: 2880, tags: ['semiconductors', 'superconductors', 'solids'], color: '#0ea5e9' },

  // ── CHEMISTRY ──
  { id: 'organic-chem', name: 'Organic Chemistry', category: 'chemistry', emoji: '🧪', description: 'Carbon compounds, reaction mechanisms, synthesis, and spectroscopy.', members: 8910, tags: ['orgo', 'reactions', 'synthesis'], color: '#10b981' },
  { id: 'inorganic-chem', name: 'Inorganic Chemistry', category: 'chemistry', emoji: '⚗️', description: 'Transition metals, coordination compounds, and non-carbon chemistry.', members: 3560, tags: ['inorganic', 'metals', 'coordination'], color: '#10b981' },
  { id: 'physical-chem', name: 'Physical Chemistry', category: 'chemistry', emoji: '🔭', description: 'Quantum chemistry, thermodynamics, kinetics, and spectroscopy.', members: 4120, tags: ['pchem', 'kinetics', 'thermochem'], color: '#10b981' },
  { id: 'biochemistry', name: 'Biochemistry', category: 'chemistry', emoji: '🧬', description: 'Proteins, enzymes, metabolism, DNA/RNA biochemistry, and molecular signalling.', members: 7230, tags: ['proteins', 'enzymes', 'metabolism'], color: '#10b981' },
  { id: 'analytical-chem', name: 'Analytical Chemistry', category: 'chemistry', emoji: '📏', description: 'Chromatography, spectroscopy, titration, and chemical measurement techniques.', members: 2890, tags: ['hplc', 'spectroscopy', 'titration'], color: '#10b981' },
  { id: 'polymer-chem', name: 'Polymer Chemistry', category: 'chemistry', emoji: '🔗', description: 'Polymers, plastics, macromolecules, and materials chemistry.', members: 1670, tags: ['polymers', 'materials', 'synthesis'], color: '#10b981' },
  { id: 'green-chem', name: 'Green Chemistry', category: 'chemistry', emoji: '🌱', description: 'Sustainable synthesis, solvent-free reactions, and eco-friendly chemical processes.', members: 2340, tags: ['sustainable', 'green', 'eco'], color: '#10b981' },

  // ── BIOLOGY ──
  { id: 'cell-biology', name: 'Cell Biology', category: 'biology', emoji: '🔬', description: 'Cell structure, organelles, signalling, and the machinery of life.', members: 6780, tags: ['cells', 'organelles', 'mitosis'], color: '#84cc16' },
  { id: 'genetics', name: 'Genetics & Genomics', category: 'biology', emoji: '🧬', description: 'Mendelian genetics, CRISPR, genome sequencing, and genetic diseases.', members: 8450, tags: ['genetics', 'dna', 'crispr'], color: '#84cc16' },
  { id: 'ecology', name: 'Ecology', category: 'biology', emoji: '🌿', description: 'Ecosystems, food webs, population dynamics, and biodiversity.', members: 4120, tags: ['ecosystem', 'population', 'biomes'], color: '#84cc16' },
  { id: 'microbiology', name: 'Microbiology', category: 'biology', emoji: '🦠', description: 'Bacteria, viruses, fungi, and the microbial world around and inside us.', members: 5670, tags: ['bacteria', 'viruses', 'pathogens'], color: '#84cc16' },
  { id: 'neuroscience', name: 'Neuroscience', category: 'biology', emoji: '🧠', description: 'The brain, neurons, synapses, cognition, and the neural basis of behaviour.', members: 9230, tags: ['neurons', 'brain', 'cognition'], color: '#84cc16' },
  { id: 'evolutionary-bio', name: 'Evolutionary Biology', category: 'biology', emoji: '🦕', description: 'Natural selection, phylogenetics, speciation, and the history of life.', members: 4890, tags: ['evolution', 'selection', 'phylogenetics'], color: '#84cc16' },
  { id: 'anatomy', name: 'Anatomy & Physiology', category: 'biology', emoji: '🫁', description: 'Human body systems, organ structure, and physiological processes.', members: 7810, tags: ['anatomy', 'physiology', 'systems'], color: '#84cc16' },
  { id: 'marine-bio', name: 'Marine Biology', category: 'biology', emoji: '🐠', description: 'Ocean life, marine ecosystems, coral reefs, and deep-sea organisms.', members: 3450, tags: ['ocean', 'marine', 'coral'], color: '#84cc16' },
  { id: 'botany', name: 'Botany & Plant Science', category: 'biology', emoji: '🌱', description: 'Plant physiology, photosynthesis, taxonomy, and plant ecology.', members: 2780, tags: ['plants', 'photosynthesis', 'taxonomy'], color: '#84cc16' },

  // ── EARTH & SPACE ──
  { id: 'geology', name: 'Geology', category: 'earth', emoji: '🪨', description: 'Plate tectonics, mineralogy, rock cycles, and the structure of the Earth.', members: 3560, tags: ['rocks', 'tectonics', 'minerals'], color: '#f59e0b' },
  { id: 'meteorology', name: 'Meteorology', category: 'earth', emoji: '🌦️', description: 'Weather patterns, atmospheric dynamics, climate forecasting, and storm systems.', members: 4230, tags: ['weather', 'atmosphere', 'climate'], color: '#f59e0b' },
  { id: 'oceanography', name: 'Oceanography', category: 'earth', emoji: '🌊', description: 'Ocean currents, chemical composition, tides, and deep-ocean phenomena.', members: 2890, tags: ['oceans', 'currents', 'tides'], color: '#f59e0b' },
  { id: 'astronomy', name: 'Astronomy & Cosmology', category: 'earth', emoji: '🔭', description: 'Galaxies, dark matter, the Big Bang, and the large-scale structure of the universe.', members: 10230, tags: ['galaxies', 'dark-matter', 'cosmology'], color: '#f59e0b' },
  { id: 'space-exploration', name: 'Space Exploration', category: 'earth', emoji: '🚀', description: 'Missions, rocketry, satellites, and the future of human spaceflight.', members: 8910, tags: ['nasa', 'rockets', 'missions'], color: '#f59e0b' },
  { id: 'climate-science', name: 'Climate Science', category: 'earth', emoji: '🌡️', description: 'Global warming, carbon cycles, climate models, and tipping points.', members: 6780, tags: ['climate', 'carbon', 'warming'], color: '#f59e0b' },
  { id: 'seismology', name: 'Seismology & Volcanology', category: 'earth', emoji: '🌋', description: 'Earthquakes, seismic waves, volcanoes, and geohazard monitoring.', members: 1890, tags: ['earthquakes', 'volcanoes', 'seismic'], color: '#f59e0b' },

  // ── COMPUTER SCIENCE ──
  { id: 'algorithms', name: 'Algorithms & Data Structures', category: 'cs', emoji: '🌲', description: 'Sorting, graphs, dynamic programming, and writing efficient code.', members: 12340, tags: ['dsa', 'leetcode', 'algorithms'], color: '#8b5cf6' },
  { id: 'ai-ml', name: 'Artificial Intelligence & ML', category: 'cs', emoji: '🤖', description: 'Neural networks, deep learning, NLP, computer vision, and modern AI.', members: 18920, tags: ['ai', 'ml', 'deep-learning'], color: '#8b5cf6' },
  { id: 'web-dev', name: 'Web Development', category: 'cs', emoji: '🌐', description: 'HTML, CSS, JavaScript, React, backend APIs, and full-stack development.', members: 16450, tags: ['webdev', 'react', 'fullstack'], color: '#8b5cf6' },
  { id: 'cybersecurity', name: 'Cybersecurity', category: 'cs', emoji: '🔐', description: 'Ethical hacking, cryptography, network security, and CTF challenges.', members: 9870, tags: ['security', 'hacking', 'ctf'], color: '#8b5cf6' },
  { id: 'databases', name: 'Databases & SQL', category: 'cs', emoji: '🗄️', description: 'Relational databases, SQL, NoSQL, query optimisation, and data modelling.', members: 7230, tags: ['sql', 'nosql', 'databases'], color: '#8b5cf6' },
  { id: 'os-systems', name: 'Operating Systems', category: 'cs', emoji: '🖥️', description: 'Process scheduling, memory management, file systems, and OS internals.', members: 5670, tags: ['os', 'linux', 'kernel'], color: '#8b5cf6' },
  { id: 'blockchain', name: 'Blockchain & Web3', category: 'cs', emoji: '🔗', description: 'Distributed ledgers, smart contracts, Ethereum, and decentralised apps.', members: 6540, tags: ['blockchain', 'ethereum', 'web3'], color: '#8b5cf6' },
  { id: 'data-science', name: 'Data Science', category: 'cs', emoji: '📊', description: 'Data analysis, pandas, visualisation, machine learning pipelines, and Jupyter.', members: 13450, tags: ['pandas', 'python', 'dataviz'], color: '#8b5cf6' },
  { id: 'cloud-computing', name: 'Cloud Computing', category: 'cs', emoji: '☁️', description: 'AWS, Azure, GCP, microservices, Docker, and cloud architecture.', members: 8760, tags: ['aws', 'docker', 'cloud'], color: '#8b5cf6' },
  { id: 'mobile-dev', name: 'Mobile Development', category: 'cs', emoji: '📱', description: 'iOS (Swift), Android (Kotlin), React Native, and Flutter for cross-platform apps.', members: 9120, tags: ['ios', 'android', 'flutter'], color: '#8b5cf6' },
  { id: 'game-dev', name: 'Game Development', category: 'cs', emoji: '🎮', description: 'Unity, Unreal Engine, game physics, shaders, and game design patterns.', members: 11230, tags: ['unity', 'unreal', 'gamedev'], color: '#8b5cf6' },
  { id: 'hci', name: 'Human-Computer Interaction', category: 'cs', emoji: '🖱️', description: 'UX design, usability research, accessibility, and interaction design.', members: 4560, tags: ['ux', 'usability', 'design'], color: '#8b5cf6' },

  // ── ENGINEERING ──
  { id: 'civil-eng', name: 'Civil Engineering', category: 'engineering', emoji: '🏗️', description: 'Structures, bridges, transportation, geotechnical, and construction engineering.', members: 5670, tags: ['structures', 'bridges', 'construction'], color: '#f97316' },
  { id: 'mechanical-eng', name: 'Mechanical Engineering', category: 'engineering', emoji: '⚙️', description: 'Dynamics, fluid mechanics, thermodynamics, manufacturing, and machine design.', members: 7890, tags: ['mechs', 'fluids', 'cad'], color: '#f97316' },
  { id: 'electrical-eng', name: 'Electrical Engineering', category: 'engineering', emoji: '⚡', description: 'Circuits, power systems, signal processing, control theory, and electronics.', members: 8230, tags: ['circuits', 'power', 'signals'], color: '#f97316' },
  { id: 'chemical-eng', name: 'Chemical Engineering', category: 'engineering', emoji: '🧫', description: 'Process design, reaction engineering, mass transfer, and chemical plant operations.', members: 4120, tags: ['process', 'reaction', 'transfer'], color: '#f97316' },
  { id: 'aerospace-eng', name: 'Aerospace Engineering', category: 'engineering', emoji: '✈️', description: 'Aerodynamics, propulsion, aircraft design, and spacecraft engineering.', members: 5890, tags: ['aerodynamics', 'propulsion', 'spacecraft'], color: '#f97316' },
  { id: 'biomedical-eng', name: 'Biomedical Engineering', category: 'engineering', emoji: '🩺', description: 'Medical devices, biomechanics, imaging systems, and tissue engineering.', members: 4780, tags: ['medical-devices', 'biomechanics', 'imaging'], color: '#f97316' },
  { id: 'robotics', name: 'Robotics & Automation', category: 'engineering', emoji: '🤖', description: 'Robot kinematics, control systems, sensors, actuators, and autonomous systems.', members: 7340, tags: ['robots', 'ros', 'automation'], color: '#f97316' },
  { id: 'software-eng', name: 'Software Engineering', category: 'engineering', emoji: '💻', description: 'System design, software architecture, testing, CI/CD, and engineering practices.', members: 14560, tags: ['architecture', 'testing', 'devops'], color: '#f97316' },
  { id: 'materials-eng', name: 'Materials Science', category: 'engineering', emoji: '🔩', description: 'Metals, ceramics, composites, nanomaterials, and material properties.', members: 3450, tags: ['materials', 'nanotech', 'composites'], color: '#f97316' },
  { id: 'nuclear-eng', name: 'Nuclear Engineering', category: 'engineering', emoji: '☢️', description: 'Reactor design, nuclear fuels, radiation safety, and fusion energy.', members: 2110, tags: ['nuclear', 'reactor', 'fusion'], color: '#f97316' },
  { id: 'env-eng', name: 'Environmental Engineering', category: 'engineering', emoji: '🌊', description: 'Water treatment, waste management, pollution control, and sustainability.', members: 3230, tags: ['water', 'waste', 'sustainability'], color: '#f97316' },
  { id: 'petroleum-eng', name: 'Petroleum Engineering', category: 'engineering', emoji: '🛢️', description: 'Reservoir engineering, drilling, production, and petroleum geology.', members: 2560, tags: ['oil', 'drilling', 'reservoir'], color: '#f97316' },

  // ── MEDICINE & HEALTH ──
  { id: 'medicine', name: 'Medicine & Clinical Studies', category: 'medicine', emoji: '⚕️', description: 'Pathology, pharmacology, clinical diagnosis, and medical case discussions.', members: 12340, tags: ['clinical', 'diagnosis', 'pathology'], color: '#ef4444' },
  { id: 'nursing', name: 'Nursing', category: 'medicine', emoji: '💉', description: 'Clinical nursing, patient care, pharmacology, and nursing practice.', members: 8910, tags: ['nursing', 'patient-care', 'clinical'], color: '#ef4444' },
  { id: 'pharmacy', name: 'Pharmacy & Pharmacology', category: 'medicine', emoji: '💊', description: 'Drug mechanisms, pharmacokinetics, clinical pharmacy, and therapeutics.', members: 5670, tags: ['drugs', 'pharmacokinetics', 'therapeutics'], color: '#ef4444' },
  { id: 'dentistry', name: 'Dentistry', category: 'medicine', emoji: '🦷', description: 'Oral anatomy, dental procedures, oral pathology, and dental materials.', members: 4120, tags: ['dental', 'oral', 'surgery'], color: '#ef4444' },
  { id: 'vet-medicine', name: 'Veterinary Medicine', category: 'medicine', emoji: '🐾', description: 'Animal anatomy, veterinary pharmacology, clinical cases, and animal surgery.', members: 3450, tags: ['vet', 'animals', 'clinical'], color: '#ef4444' },
  { id: 'public-health', name: 'Public Health & Epidemiology', category: 'medicine', emoji: '🌍', description: 'Disease surveillance, epidemiology, health policy, and global health.', members: 5890, tags: ['epidemiology', 'global-health', 'policy'], color: '#ef4444' },
  { id: 'nutrition', name: 'Nutrition & Dietetics', category: 'medicine', emoji: '🥗', description: 'Macronutrients, metabolism, clinical nutrition, and dietary planning.', members: 6780, tags: ['nutrition', 'diet', 'metabolism'], color: '#ef4444' },
  { id: 'physiotherapy', name: 'Physiotherapy & Rehab', category: 'medicine', emoji: '🏃', description: 'Musculoskeletal rehab, movement science, and physical therapy.', members: 3230, tags: ['physio', 'rehab', 'movement'], color: '#ef4444' },
  { id: 'radiology', name: 'Radiology & Medical Imaging', category: 'medicine', emoji: '🩻', description: 'X-ray, CT, MRI, ultrasound, nuclear medicine, and image interpretation.', members: 3890, tags: ['radiology', 'mri', 'imaging'], color: '#ef4444' },
  { id: 'optometry', name: 'Optometry & Ophthalmology', category: 'medicine', emoji: '👁️', description: 'Vision science, eye anatomy, optics, and clinical eye care.', members: 2340, tags: ['eye', 'vision', 'optics'], color: '#ef4444' },

  // ── SOCIAL SCIENCES ──
  { id: 'economics', name: 'Economics', category: 'social', emoji: '📈', description: 'Micro and macroeconomics, game theory, econometrics, and economic policy.', members: 10230, tags: ['macro', 'micro', 'econometrics'], color: '#06b6d4' },
  { id: 'sociology', name: 'Sociology', category: 'social', emoji: '👥', description: 'Social structures, inequality, culture, institutions, and sociological theory.', members: 5670, tags: ['society', 'culture', 'inequality'], color: '#06b6d4' },
  { id: 'political-science', name: 'Political Science', category: 'social', emoji: '🗳️', description: 'Political theory, comparative politics, international relations, and governance.', members: 7890, tags: ['politics', 'ir', 'governance'], color: '#06b6d4' },
  { id: 'anthropology', name: 'Anthropology', category: 'social', emoji: '🪆', description: 'Cultural, biological, linguistic, and archaeological perspectives on humanity.', members: 3450, tags: ['culture', 'archaeology', 'linguistic'], color: '#06b6d4' },
  { id: 'geography', name: 'Geography', category: 'social', emoji: '🗺️', description: 'Human and physical geography, GIS, urban planning, and spatial analysis.', members: 4230, tags: ['gis', 'urban', 'spatial'], color: '#06b6d4' },
  { id: 'social-work', name: 'Social Work', category: 'social', emoji: '🤝', description: 'Social welfare, community practice, counselling, and social policy.', members: 4560, tags: ['welfare', 'community', 'counselling'], color: '#06b6d4' },
  { id: 'criminology', name: 'Criminology', category: 'social', emoji: '🔍', description: 'Crime theories, forensic science, criminal justice, and penology.', members: 5230, tags: ['crime', 'forensics', 'justice'], color: '#06b6d4' },
  { id: 'international-rel', name: 'International Relations', category: 'social', emoji: '🌐', description: 'Diplomacy, geopolitics, international law, and global governance.', members: 6780, tags: ['diplomacy', 'geopolitics', 'un'], color: '#06b6d4' },

  // ── HUMANITIES ──
  { id: 'history', name: 'History', category: 'humanities', emoji: '📜', description: 'Ancient, medieval, modern, and contemporary history from all civilisations.', members: 8910, tags: ['ancient', 'modern', 'world-history'], color: '#a3714a' },
  { id: 'literature', name: 'Literature', category: 'humanities', emoji: '📚', description: 'Literary analysis, fiction, poetry, world literature, and critical theory.', members: 6780, tags: ['fiction', 'poetry', 'analysis'], color: '#a3714a' },
  { id: 'classical-studies', name: 'Classical Studies', category: 'humanities', emoji: '🏛️', description: 'Ancient Greek, Latin, Roman and Greek history, myths, and classical texts.', members: 2340, tags: ['greek', 'latin', 'rome'], color: '#a3714a' },
  { id: 'archaeology', name: 'Archaeology', category: 'humanities', emoji: '🏺', description: 'Excavation methods, material culture, and the physical record of past societies.', members: 3120, tags: ['excavation', 'artefacts', 'prehistory'], color: '#a3714a' },
  { id: 'art-history', name: 'Art History', category: 'humanities', emoji: '🖼️', description: 'Western and non-Western art movements, iconography, and visual culture.', members: 4560, tags: ['renaissance', 'modern-art', 'iconography'], color: '#a3714a' },
  { id: 'cultural-studies', name: 'Cultural Studies', category: 'humanities', emoji: '🎭', description: 'Popular culture, identity, postcolonialism, and cultural theory.', members: 3780, tags: ['culture', 'identity', 'postcolonialism'], color: '#a3714a' },
  { id: 'gender-studies', name: 'Gender & Women\'s Studies', category: 'humanities', emoji: '♀️', description: 'Feminist theory, gender identity, sexuality studies, and intersectionality.', members: 4230, tags: ['feminism', 'gender', 'intersectionality'], color: '#a3714a' },

  // ── LANGUAGES ──
  { id: 'english', name: 'English Language & Linguistics', category: 'languages', emoji: '🇬🇧', description: 'Grammar, writing, rhetoric, academic English, and English linguistics.', members: 14560, tags: ['english', 'writing', 'grammar'], color: '#3b82f6' },
  { id: 'spanish', name: 'Spanish', category: 'languages', emoji: '🇪🇸', description: 'Spanish grammar, conversation, literature, and Latin American studies.', members: 10230, tags: ['spanish', 'conversation', 'grammar'], color: '#3b82f6' },
  { id: 'french', name: 'French', category: 'languages', emoji: '🇫🇷', description: 'French grammar, conversational French, literature, and Francophone culture.', members: 8780, tags: ['french', 'grammar', 'culture'], color: '#3b82f6' },
  { id: 'mandarin', name: 'Mandarin Chinese', category: 'languages', emoji: '🇨🇳', description: 'Mandarin grammar, HSK prep, tones, characters, and spoken practice.', members: 12340, tags: ['mandarin', 'hsk', 'characters'], color: '#3b82f6' },
  { id: 'arabic', name: 'Arabic', category: 'languages', emoji: '🇸🇦', description: 'Modern Standard Arabic, dialects, the Arabic script, and Islamic texts.', members: 6780, tags: ['arabic', 'msa', 'script'], color: '#3b82f6' },
  { id: 'german', name: 'German', category: 'languages', emoji: '🇩🇪', description: 'German grammar, Goethe exam prep, and German culture and literature.', members: 7230, tags: ['german', 'grammar', 'goethe'], color: '#3b82f6' },
  { id: 'japanese', name: 'Japanese', category: 'languages', emoji: '🇯🇵', description: 'Hiragana, katakana, kanji, JLPT prep, and Japanese culture.', members: 9870, tags: ['japanese', 'jlpt', 'kanji'], color: '#3b82f6' },
  { id: 'portuguese', name: 'Portuguese', category: 'languages', emoji: '🇵🇹', description: 'European and Brazilian Portuguese, grammar, and Lusophone culture.', members: 5670, tags: ['portuguese', 'brazil', 'grammar'], color: '#3b82f6' },
  { id: 'russian', name: 'Russian', category: 'languages', emoji: '🇷🇺', description: 'Cyrillic script, Russian grammar, TORFL prep, and Russian literature.', members: 4560, tags: ['russian', 'cyrillic', 'grammar'], color: '#3b82f6' },
  { id: 'korean', name: 'Korean', category: 'languages', emoji: '🇰🇷', description: 'Hangul, TOPIK prep, grammar, K-pop culture, and conversation practice.', members: 8120, tags: ['korean', 'topik', 'hangul'], color: '#3b82f6' },
  { id: 'latin', name: 'Latin & Ancient Greek', category: 'languages', emoji: '🏛️', description: 'Classical Latin, ancient Greek, declensions, and reading ancient texts.', members: 1890, tags: ['latin', 'greek', 'classical'], color: '#3b82f6' },
  { id: 'sign-language', name: 'Sign Languages', category: 'languages', emoji: '🤟', description: 'ASL, BSL, and other sign languages — community and academic study.', members: 3450, tags: ['asl', 'bsl', 'deaf-culture'], color: '#3b82f6' },

  // ── ARTS & DESIGN ──
  { id: 'visual-arts', name: 'Visual Arts & Fine Art', category: 'arts', emoji: '🎨', description: 'Drawing, painting, printmaking, sculpture, and contemporary art practice.', members: 6780, tags: ['painting', 'drawing', 'sculpture'], color: '#ec4899' },
  { id: 'music-theory', name: 'Music Theory & Composition', category: 'arts', emoji: '🎼', description: 'Harmony, counterpoint, scales, composition, and music analysis.', members: 7230, tags: ['theory', 'composition', 'harmony'], color: '#ec4899' },
  { id: 'music-performance', name: 'Music Performance', category: 'arts', emoji: '🎸', description: 'Instrument technique, practice strategies, performance anxiety, and repertoire.', members: 8910, tags: ['performance', 'instrument', 'practice'], color: '#ec4899' },
  { id: 'film-studies', name: 'Film Studies & Cinematography', category: 'arts', emoji: '🎬', description: 'Film theory, directing, cinematography, editing, and film history.', members: 5670, tags: ['film', 'cinematography', 'directing'], color: '#ec4899' },
  { id: 'theater', name: 'Theatre & Performing Arts', category: 'arts', emoji: '🎭', description: 'Acting, directing, stagecraft, drama theory, and performance studies.', members: 4120, tags: ['acting', 'theatre', 'stagecraft'], color: '#ec4899' },
  { id: 'dance', name: 'Dance & Choreography', category: 'arts', emoji: '💃', description: 'Classical, contemporary, and folk dance — technique, history, and choreography.', members: 3450, tags: ['dance', 'choreography', 'ballet'], color: '#ec4899' },
  { id: 'graphic-design', name: 'Graphic Design & Typography', category: 'arts', emoji: '✏️', description: 'Visual hierarchy, typography, branding, Figma, Illustrator, and design principles.', members: 10230, tags: ['design', 'typography', 'figma'], color: '#ec4899' },
  { id: 'photography', name: 'Photography', category: 'arts', emoji: '📷', description: 'Composition, exposure, editing, studio lighting, and photographic theory.', members: 8780, tags: ['photography', 'editing', 'lighting'], color: '#ec4899' },
  { id: 'fashion', name: 'Fashion Design & Textiles', category: 'arts', emoji: '👗', description: 'Pattern making, garment construction, textile science, and fashion history.', members: 4560, tags: ['fashion', 'textiles', 'pattern'], color: '#ec4899' },
  { id: 'animation', name: 'Animation & Motion Design', category: 'arts', emoji: '🎞️', description: 'Keyframing, rigging, motion graphics, and 2D/3D animation techniques.', members: 6340, tags: ['animation', 'motion', '3d'], color: '#ec4899' },

  // ── BUSINESS ──
  { id: 'accounting', name: 'Accounting & Finance', category: 'business', emoji: '📒', description: 'Financial statements, management accounting, auditing, and IFRS/GAAP.', members: 9870, tags: ['accounting', 'ifrs', 'audit'], color: '#059669' },
  { id: 'finance', name: 'Financial Markets & Investment', category: 'business', emoji: '💹', description: 'Stock markets, portfolio theory, derivatives, and corporate finance.', members: 11230, tags: ['investing', 'markets', 'portfolio'], color: '#059669' },
  { id: 'marketing', name: 'Marketing', category: 'business', emoji: '📣', description: 'Consumer behaviour, digital marketing, branding, and marketing analytics.', members: 8910, tags: ['marketing', 'branding', 'digital'], color: '#059669' },
  { id: 'management', name: 'Management & Leadership', category: 'business', emoji: '🧭', description: 'Organisational behaviour, strategy, leadership styles, and business ethics.', members: 7230, tags: ['management', 'leadership', 'strategy'], color: '#059669' },
  { id: 'entrepreneurship', name: 'Entrepreneurship & Startups', category: 'business', emoji: '🚀', description: 'Startup fundamentals, funding, product-market fit, and building teams.', members: 10450, tags: ['startups', 'funding', 'product'], color: '#059669' },
  { id: 'supply-chain', name: 'Supply Chain & Logistics', category: 'business', emoji: '🚚', description: 'Operations management, inventory, procurement, and global supply chains.', members: 4120, tags: ['logistics', 'operations', 'supply'], color: '#059669' },
  { id: 'human-resources', name: 'Human Resources', category: 'business', emoji: '👔', description: 'HR management, recruitment, employment law, and organisational development.', members: 4780, tags: ['hr', 'recruitment', 'employment'], color: '#059669' },
  { id: 'real-estate', name: 'Real Estate & Property', category: 'business', emoji: '🏠', description: 'Property valuation, real estate finance, planning law, and investment.', members: 5670, tags: ['property', 'valuation', 'investment'], color: '#059669' },
  { id: 'international-business', name: 'International Business', category: 'business', emoji: '✈️', description: 'Cross-cultural management, global trade, FDI, and international strategy.', members: 5890, tags: ['international', 'trade', 'global'], color: '#059669' },

  // ── LAW ──
  { id: 'constitutional-law', name: 'Constitutional & Public Law', category: 'law', emoji: '⚖️', description: 'Constitutional principles, public law, judicial review, and fundamental rights.', members: 4560, tags: ['constitutional', 'public-law', 'rights'], color: '#7c3aed' },
  { id: 'criminal-law', name: 'Criminal Law', category: 'law', emoji: '🔨', description: 'Offences, defences, criminal procedure, sentencing, and criminology.', members: 5670, tags: ['criminal', 'procedure', 'sentencing'], color: '#7c3aed' },
  { id: 'corporate-law', name: 'Corporate & Commercial Law', category: 'law', emoji: '🏢', description: 'Company law, contracts, mergers, securities law, and corporate governance.', members: 4230, tags: ['corporate', 'contracts', 'commercial'], color: '#7c3aed' },
  { id: 'international-law', name: 'International Law', category: 'law', emoji: '🌐', description: 'Treaties, human rights law, international organisations, and public international law.', members: 3780, tags: ['international', 'human-rights', 'treaties'], color: '#7c3aed' },
  { id: 'intellectual-property', name: 'Intellectual Property Law', category: 'law', emoji: '™️', description: 'Patents, trademarks, copyright, trade secrets, and IP strategy.', members: 3450, tags: ['patents', 'copyright', 'trademarks'], color: '#7c3aed' },
  { id: 'family-law', name: 'Family & Civil Law', category: 'law', emoji: '👨‍👩‍👧', description: 'Family law, tort law, property law, and civil litigation.', members: 3120, tags: ['family', 'tort', 'civil'], color: '#7c3aed' },

  // ── EDUCATION ──
  { id: 'pedagogy', name: 'Pedagogy & Teaching Methods', category: 'education', emoji: '🍎', description: 'Curriculum design, instructional strategies, learning theories, and assessment.', members: 6780, tags: ['teaching', 'curriculum', 'pedagogy'], color: '#d97706' },
  { id: 'early-childhood', name: 'Early Childhood Education', category: 'education', emoji: '🧒', description: 'Child development, play-based learning, early literacy, and Montessori methods.', members: 4560, tags: ['early-childhood', 'montessori', 'play'], color: '#d97706' },
  { id: 'special-education', name: 'Special Education & Inclusion', category: 'education', emoji: '♿', description: 'Learning differences, IEPs, autism, dyslexia, and inclusive classroom practices.', members: 4120, tags: ['special-ed', 'inclusion', 'autism'], color: '#d97706' },
  { id: 'educational-tech', name: 'Educational Technology', category: 'education', emoji: '💻', description: 'E-learning, LMS platforms, instructional design, and edtech tools.', members: 5670, tags: ['edtech', 'elearning', 'lms'], color: '#d97706' },
  { id: 'higher-ed', name: 'Higher Education & Research', category: 'education', emoji: '🎓', description: 'Academic research methods, university pedagogy, and scholarly writing.', members: 8910, tags: ['research', 'academic-writing', 'phd'], color: '#d97706' },

  // ── AGRICULTURE & FOOD ──
  { id: 'agronomy', name: 'Agronomy & Crop Science', category: 'agriculture', emoji: '🌽', description: 'Crop production, soil science, plant breeding, and agronomic practices.', members: 3120, tags: ['crops', 'soil', 'agronomy'], color: '#65a30d' },
  { id: 'animal-science', name: 'Animal Science & Husbandry', category: 'agriculture', emoji: '🐄', description: 'Livestock management, animal nutrition, breeding, and production systems.', members: 2780, tags: ['livestock', 'breeding', 'nutrition'], color: '#65a30d' },
  { id: 'food-science', name: 'Food Science & Technology', category: 'agriculture', emoji: '🍕', description: 'Food chemistry, processing, preservation, quality control, and food safety.', members: 4230, tags: ['food', 'processing', 'safety'], color: '#65a30d' },
  { id: 'horticulture', name: 'Horticulture', category: 'agriculture', emoji: '🌸', description: 'Fruit, vegetable, and ornamental plant cultivation, and urban gardening.', members: 2450, tags: ['plants', 'gardening', 'crops'], color: '#65a30d' },
  { id: 'forestry', name: 'Forestry & Arboriculture', category: 'agriculture', emoji: '🌲', description: 'Forest management, timber production, wildlife habitats, and arboriculture.', members: 1890, tags: ['forestry', 'timber', 'wildlife'], color: '#65a30d' },
  { id: 'aquaculture', name: 'Aquaculture & Fisheries', category: 'agriculture', emoji: '🐟', description: 'Fish farming, marine aquaculture, fisheries management, and ocean food systems.', members: 1680, tags: ['fish', 'aquaculture', 'fisheries'], color: '#65a30d' },

  // ── ARCHITECTURE ──
  { id: 'architecture', name: 'Architecture & Design', category: 'architecture', emoji: '🏛️', description: 'Architectural design, history, theory, building technologies, and urban design.', members: 6780, tags: ['architecture', 'design', 'urban'], color: '#b45309' },
  { id: 'urban-planning', name: 'Urban Planning & Development', category: 'architecture', emoji: '🏙️', description: 'City planning, zoning, transport planning, and sustainable urban development.', members: 4120, tags: ['planning', 'zoning', 'urban'], color: '#b45309' },
  { id: 'interior-design', name: 'Interior Design', category: 'architecture', emoji: '🛋️', description: 'Space planning, materials, lighting design, and residential and commercial interiors.', members: 5670, tags: ['interiors', 'space', 'lighting'], color: '#b45309' },
  { id: 'landscape-arch', name: 'Landscape Architecture', category: 'architecture', emoji: '🌳', description: 'Landscape design, ecological planning, parks, and outdoor space design.', members: 2340, tags: ['landscape', 'parks', 'ecological'], color: '#b45309' },

  // ── PSYCHOLOGY ──
  { id: 'cognitive-psych', name: 'Cognitive Psychology', category: 'psychology', emoji: '🧠', description: 'Memory, attention, perception, language, and cognitive processes.', members: 8910, tags: ['cognition', 'memory', 'perception'], color: '#a855f7' },
  { id: 'clinical-psych', name: 'Clinical & Abnormal Psychology', category: 'psychology', emoji: '🛋️', description: 'Mental disorders, DSM, psychotherapy approaches, and clinical assessment.', members: 10230, tags: ['clinical', 'dsm', 'therapy'], color: '#a855f7' },
  { id: 'developmental-psych', name: 'Developmental Psychology', category: 'psychology', emoji: '👶', description: 'Child development, Piaget, attachment theory, and lifespan development.', members: 5670, tags: ['development', 'piaget', 'attachment'], color: '#a855f7' },
  { id: 'social-psych', name: 'Social Psychology', category: 'psychology', emoji: '👫', description: 'Attitudes, conformity, persuasion, group dynamics, and social influence.', members: 7230, tags: ['social', 'conformity', 'influence'], color: '#a855f7' },
  { id: 'forensic-psych', name: 'Forensic Psychology', category: 'psychology', emoji: '🔍', description: 'Criminal behaviour, offender profiling, eyewitness testimony, and expert evidence.', members: 5450, tags: ['forensic', 'criminal', 'profiling'], color: '#a855f7' },
  { id: 'sport-psych', name: 'Sport & Performance Psychology', category: 'psychology', emoji: '🏅', description: 'Mental performance, flow states, motivation, and psychological skills for athletes.', members: 3780, tags: ['sport', 'performance', 'motivation'], color: '#a855f7' },

  // ── PHILOSOPHY ──
  { id: 'ethics', name: 'Ethics & Moral Philosophy', category: 'philosophy', emoji: '⚖️', description: 'Utilitarianism, deontology, virtue ethics, applied ethics, and moral dilemmas.', members: 7230, tags: ['ethics', 'utilitarianism', 'kant'], color: '#64748b' },
  { id: 'epistemology', name: 'Epistemology & Logic', category: 'philosophy', emoji: '🔮', description: 'Knowledge, belief, justification, formal logic, and the limits of reason.', members: 3780, tags: ['epistemology', 'logic', 'knowledge'], color: '#64748b' },
  { id: 'metaphysics', name: 'Metaphysics & Philosophy of Mind', category: 'philosophy', emoji: '🌌', description: 'Consciousness, personal identity, free will, time, and the nature of reality.', members: 5120, tags: ['consciousness', 'free-will', 'mind'], color: '#64748b' },
  { id: 'philosophy-science', name: 'Philosophy of Science', category: 'philosophy', emoji: '🔬', description: 'Scientific method, falsificationism, paradigm shifts, and science studies.', members: 4230, tags: ['science', 'kuhn', 'popper'], color: '#64748b' },
  { id: 'political-philosophy', name: 'Political Philosophy', category: 'philosophy', emoji: '🗳️', description: 'Justice, liberty, democracy, social contract theory, and political thought.', members: 5670, tags: ['justice', 'rawls', 'democracy'], color: '#64748b' },

  // ── SPORTS SCIENCE ──
  { id: 'exercise-science', name: 'Exercise Science & Kinesiology', category: 'sports', emoji: '🏋️', description: 'Exercise physiology, biomechanics, motor control, and fitness science.', members: 6780, tags: ['exercise', 'physiology', 'biomechanics'], color: '#f59e0b' },
  { id: 'sports-coaching', name: 'Sports Coaching & Management', category: 'sports', emoji: '🏆', description: 'Coaching methodology, athlete development, sports management, and analytics.', members: 4560, tags: ['coaching', 'athletics', 'management'], color: '#f59e0b' },
  { id: 'sports-medicine', name: 'Sports Medicine & Injury', category: 'sports', emoji: '🩹', description: 'Injury prevention, sports injuries, rehabilitation, and performance medicine.', members: 5230, tags: ['injury', 'rehabilitation', 'medicine'], color: '#f59e0b' },

  // ── ENVIRONMENTAL STUDIES ──
  { id: 'env-science', name: 'Environmental Science', category: 'environment', emoji: '🌿', description: 'Pollution, biodiversity, ecosystem services, and environmental monitoring.', members: 6780, tags: ['pollution', 'biodiversity', 'monitoring'], color: '#22c55e' },
  { id: 'sustainability', name: 'Sustainability & Circular Economy', category: 'environment', emoji: '♻️', description: 'Sustainable development goals, circular economy, renewable energy, and ESG.', members: 8910, tags: ['sdg', 'renewable', 'esg'], color: '#22c55e' },
  { id: 'conservation', name: 'Conservation Biology', category: 'environment', emoji: '🐘', description: 'Species conservation, habitat restoration, wildlife management, and IUCN.', members: 4120, tags: ['conservation', 'wildlife', 'habitat'], color: '#22c55e' },
  { id: 'renewable-energy', name: 'Renewable Energy', category: 'environment', emoji: '☀️', description: 'Solar, wind, hydrogen, energy storage, and the energy transition.', members: 7230, tags: ['solar', 'wind', 'energy'], color: '#22c55e' },

  // ── MEDIA & COMMUNICATION ──
  { id: 'journalism', name: 'Journalism & Media Studies', category: 'media', emoji: '📰', description: 'News writing, investigative journalism, media ethics, and press freedom.', members: 5670, tags: ['journalism', 'news', 'media'], color: '#0284c7' },
  { id: 'communication', name: 'Communication & Rhetoric', category: 'media', emoji: '🗣️', description: 'Persuasion, public speaking, interpersonal communication, and rhetoric.', members: 6780, tags: ['communication', 'rhetoric', 'speaking'], color: '#0284c7' },
  { id: 'advertising', name: 'Advertising & PR', category: 'media', emoji: '📣', description: 'Ad copywriting, campaign strategy, public relations, and media buying.', members: 5230, tags: ['advertising', 'pr', 'campaigns'], color: '#0284c7' },
  { id: 'digital-media', name: 'Digital Media & Social Media', category: 'media', emoji: '📱', description: 'Content strategy, social media marketing, analytics, and digital storytelling.', members: 9870, tags: ['social-media', 'content', 'digital'], color: '#0284c7' },

  // ── THEOLOGY & RELIGION ──
  { id: 'theology', name: 'Theology & Religious Studies', category: 'theology', emoji: '✝️', description: 'Systematic theology, world religions, sacred texts, and religious history.', members: 4120, tags: ['theology', 'religion', 'texts'], color: '#9333ea' },
  { id: 'islamic-studies', name: 'Islamic Studies', category: 'theology', emoji: '☪️', description: 'Quran, hadith, Islamic law, history, and Islamic philosophy.', members: 5670, tags: ['islam', 'quran', 'sharia'], color: '#9333ea' },
  { id: 'comparative-religion', name: 'Comparative Religion', category: 'theology', emoji: '☸️', description: 'Hinduism, Buddhism, Judaism, Sikhism, and cross-religious analysis.', members: 3450, tags: ['hinduism', 'buddhism', 'comparative'], color: '#9333ea' },

  // ── MILITARY & SECURITY ──
  { id: 'defence-security', name: 'Defence & Security Studies', category: 'military', emoji: '🛡️', description: 'Security strategy, arms control, intelligence studies, and defence policy.', members: 3120, tags: ['security', 'defence', 'intelligence'], color: '#475569' },
  { id: 'strategic-studies', name: 'Strategic Studies & Geopolitics', category: 'military', emoji: '🌍', description: 'Grand strategy, geopolitics, war theory, and military history.', members: 4230, tags: ['strategy', 'geopolitics', 'war'], color: '#475569' },
]
