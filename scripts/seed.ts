/**
 * Seeds Firestore with sample vehicles and a default `settings/showroom`.
 *
 * Six ربع نقل, two ميكروباص and two ملاكي, so every labelled section on the
 * inventory page has something in it.
 *
 * This is a standalone script and never a fallback inside the app — the app
 * reads from Firestore only (build spec §15).
 *
 * Run it with:
 *
 *   SEED_ADMIN_EMAIL=owner@example.com SEED_ADMIN_PASSWORD=... npm run seed
 *
 * It signs in as the real admin account and writes through the ordinary
 * security rules, so a successful run is also a check that
 * `firestore.rules` and `admins/{uid}` are set up correctly. There is no
 * Admin SDK and no service-account key anywhere in this repository.
 *
 * It refuses to touch a collection that already has vehicles unless you pass
 * `--force`.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { environment } from '../src/environments/environment';
import type { ShowroomSettingsDraft } from '../src/app/core/models/showroom-settings.model';
import type { VehicleDraft } from '../src/app/core/models/vehicle.model';

/** Clearly-fake images. The owner replaces these from /admin/vehicles. */
function placeholder(label: string, index = 1): string {
  return `https://placehold.co/1200x900/1B1A18/D4AF7C/png?text=${encodeURIComponent(`${label} ${index}`)}`;
}

function gallery(label: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => placeholder(label, index + 1));
}

const VEHICLES: VehicleDraft[] = [
  {
    category: 'pickup',
    brand: 'شيفروليه',
    model: 'ربع نقل',
    year: 2022,
    price: 545000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أحمر',
    colorHex: '#C0392B',
    mileage: 25000,
    condition: 'used',
    engine: '2.5L',
    power: '150 حصان',
    transmission: 'مانيوال',
    fuelType: 'بنزين',
    payload: '800 كجم',
    bedType: 'صندوق مفتوح',
    description: 'عربية بحالة ممتازة، صيانة منتظمة في التوكيل وفابريكة بالكامل.',
    features: ['تكييف', 'باور ستيرنج', 'وسائد هوائية', 'فرامل ABS'],
    coverImageUrl: placeholder('شيفروليه ربع نقل 2022'),
    imageUrls: gallery('شيفروليه ربع نقل 2022', 4),
    status: 'available',
    isFeatured: true,
  },
  {
    category: 'pickup',
    brand: 'شيفروليه',
    model: 'ربع نقل',
    year: 2021,
    price: 520000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أبيض',
    colorHex: '#E8E1D3',
    mileage: 62000,
    condition: 'used',
    engine: '2.5L',
    power: '150 حصان',
    transmission: 'مانيوال',
    fuelType: 'بنزين',
    payload: '800 كجم',
    bedType: 'صندوق مفتوح',
    description: 'ماشية 62 ألف كيلو بس، الكاوتش جديد والفرامل متغيرة.',
    features: ['تكييف', 'باور ستيرنج'],
    coverImageUrl: placeholder('شيفروليه ربع نقل 2021'),
    imageUrls: gallery('شيفروليه ربع نقل 2021', 3),
    status: 'available',
  },
  {
    category: 'pickup',
    brand: 'شيفروليه',
    model: 'نص نقل',
    year: 2023,
    price: 580000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أزرق',
    colorHex: '#2E5C8A',
    mileage: 12000,
    condition: 'used',
    engine: '2.8L ديزل',
    power: '180 حصان',
    transmission: 'أوتوماتيك',
    fuelType: 'ديزل',
    payload: '1000 كجم',
    bedType: 'صندوق مغطى',
    description: 'موديل 2023 وماشية 12 ألف كيلو، زيرو تقريبًا.',
    features: ['تكييف', 'شاشة', 'كاميرا خلفية', 'وسائد هوائية', 'فرامل ABS'],
    coverImageUrl: placeholder('شيفروليه نص نقل 2023'),
    imageUrls: gallery('شيفروليه نص نقل 2023', 5),
    status: 'available',
    isFeatured: true,
  },
  {
    category: 'pickup',
    brand: 'إسوزو',
    model: 'نص نقل',
    year: 2020,
    price: 495000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أبيض',
    colorHex: '#E8E1D3',
    mileage: 98000,
    condition: 'used',
    engine: '2.5L ديزل',
    power: '136 حصان',
    transmission: 'مانيوال',
    fuelType: 'ديزل',
    payload: '1200 كجم',
    bedType: 'صندوق مفتوح',
    description: 'عربية شغل قوية، موتور ديزل موفر ومناسب للحمولات التقيلة.',
    features: ['تكييف', 'باور ستيرنج'],
    coverImageUrl: placeholder('إسوزو نص نقل 2020'),
    imageUrls: gallery('إسوزو نص نقل 2020', 3),
    status: 'available',
  },
  {
    category: 'pickup',
    brand: 'سوزوكي',
    model: 'ربع نقل',
    year: 2022,
    price: 335000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'فضي',
    colorHex: '#B9B4AA',
    mileage: 40000,
    condition: 'used',
    engine: '1.0L',
    power: '68 حصان',
    transmission: 'مانيوال',
    fuelType: 'بنزين',
    payload: '600 كجم',
    bedType: 'صندوق مفتوح',
    description: 'مناسبة جدًا للتوصيل جوه المدينة، بنزين موفر وصيانتها رخيصة.',
    features: ['تكييف'],
    coverImageUrl: placeholder('سوزوكي ربع نقل 2022'),
    imageUrls: gallery('سوزوكي ربع نقل 2022', 3),
    status: 'reserved',
  },
  {
    category: 'pickup',
    brand: 'دونج فينج',
    model: 'نص نقل',
    year: 2021,
    price: null,
    priceOnRequest: true,
    currency: 'EGP',
    color: 'رمادي',
    colorHex: '#6E6A63',
    mileage: 75000,
    condition: 'used',
    engine: '2.3L ديزل',
    transmission: 'مانيوال',
    fuelType: 'ديزل',
    payload: '1500 كجم',
    bedType: 'صندوق مفتوح',
    description: 'السعر بيتحدد على حسب المعاينة، كلمنا على واتساب.',
    coverImageUrl: placeholder('دونج فينج نص نقل 2021'),
    imageUrls: gallery('دونج فينج نص نقل 2021', 2),
    status: 'available',
  },
  {
    category: 'minibus',
    brand: 'تويوتا',
    model: 'هايس',
    year: 2021,
    price: 1150000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أبيض',
    colorHex: '#E8E1D3',
    mileage: 120000,
    condition: 'used',
    engine: '2.5L ديزل',
    power: '102 حصان',
    transmission: 'مانيوال',
    fuelType: 'ديزل',
    seats: 14,
    description: 'هايس شغل خطوط، صيانة دورية والموتور نضيف. مناسبة للرحلات والتوصيل.',
    features: ['تكييف', 'باور ستيرنج', 'فرامل ABS'],
    coverImageUrl: placeholder('تويوتا هايس 2021'),
    imageUrls: gallery('تويوتا هايس 2021', 4),
    status: 'available',
    isFeatured: true,
  },
  {
    category: 'minibus',
    brand: 'ميتسوبيشي',
    model: 'روزا',
    year: 2019,
    price: 1480000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أبيض',
    colorHex: '#E8E1D3',
    mileage: 185000,
    condition: 'used',
    engine: '3.9L ديزل',
    power: '150 حصان',
    transmission: 'مانيوال',
    fuelType: 'ديزل',
    seats: 26,
    description: 'روزا بحالة كويسة، كاوتش جديد ومكيفة. مناسبة لنقل العمال والرحلات الطويلة.',
    features: ['تكييف', 'فرامل ABS'],
    coverImageUrl: placeholder('ميتسوبيشي روزا 2019'),
    imageUrls: gallery('ميتسوبيشي روزا 2019', 3),
    status: 'available',
  },
  {
    category: 'passenger',
    brand: 'شيفروليه',
    model: 'أوبترا',
    year: 2021,
    price: 620000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أبيض',
    colorHex: '#E8E1D3',
    mileage: 55000,
    condition: 'used',
    engine: '1.6L',
    power: '109 حصان',
    transmission: 'أوتوماتيك',
    fuelType: 'بنزين',
    description: 'أوبترا فابريكة بالكامل، أول مالك ومرخصة لغاية آخر السنة.',
    features: ['تكييف', 'شاشة', 'حساسات ركن', 'وسائد هوائية'],
    coverImageUrl: placeholder('شيفروليه أوبترا 2021'),
    imageUrls: gallery('شيفروليه أوبترا 2021', 4),
    status: 'available',
  },
  {
    category: 'passenger',
    brand: 'هيونداي',
    model: 'النترا',
    year: 2022,
    price: 890000,
    priceOnRequest: false,
    currency: 'EGP',
    color: 'أسود',
    colorHex: '#1B1A18',
    mileage: 30000,
    condition: 'used',
    engine: '1.6L',
    power: '128 حصان',
    transmission: 'أوتوماتيك',
    fuelType: 'بنزين',
    description: 'النترا 2022 بحالة الزيرو، فتحة سقف وشاشة أصلية.',
    features: ['تكييف', 'فتحة سقف', 'شاشة', 'كاميرا خلفية', 'وسائد هوائية', 'فرامل ABS'],
    coverImageUrl: placeholder('هيونداي النترا 2022'),
    imageUrls: gallery('هيونداي النترا 2022', 5),
    status: 'available',
    isFeatured: true,
  },
];

const SETTINGS: ShowroomSettingsDraft = {
  showroomName: 'معرض الأندلس',
  whatsappNumber: environment.whatsappNumber,
  phoneNumber: '+20 127 636 4094',
  address: 'العنوان الحقيقي للمعرض — غيّره من /admin/settings',
  workingHours: 'من السبت للخميس، 10 صباحًا لـ 8 مساءً',
  heroImageUrl: placeholder('صورة الهيدر'),
  heroHeading: 'الأندلس',
  heroSubheading: 'لبيع وشراء السيارات',
  heroDescription: 'سيارات ربع نقل ونص نقل بحالة ممتازة .. وجودة تضمن لك الطريق',
  showPassengerVehicles: true,
};

/** Firestore rejects `undefined`; `null` is meaningful. */
function stripUndefined<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function main(): Promise<void> {
  const email = process.env['SEED_ADMIN_EMAIL'];
  const password = process.env['SEED_ADMIN_PASSWORD'];

  if (!email || !password) {
    console.error(
      'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to the admin account created in the\n' +
        'Firebase console. The seed writes through the ordinary security rules.',
    );
    process.exitCode = 1;
    return;
  }

  const force = process.argv.includes('--force');

  const app = initializeApp(environment.firebase, 'al-andalus-seed');
  const firestore = getFirestore(app);

  console.log(`Signing in as ${email}…`);
  await signInWithEmailAndPassword(getAuth(app), email, password);

  const existing = await getDocs(collection(firestore, 'vehicles'));
  if (!existing.empty && !force) {
    console.error(
      `vehicles already holds ${existing.size} document(s). Re-run with --force to add the\n` +
        'sample data anyway (this appends, it does not replace).',
    );
    process.exitCode = 1;
    return;
  }

  for (const vehicle of VEHICLES) {
    const reference = await addDoc(collection(firestore, 'vehicles'), {
      ...stripUndefined(vehicle),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`  + ${vehicle.brand} ${vehicle.model} ${vehicle.year} → ${reference.id}`);
  }

  await setDoc(
    doc(firestore, 'settings', 'showroom'),
    { ...SETTINGS, updatedAt: serverTimestamp() },
    { merge: true },
  );
  console.log('  + settings/showroom');

  console.log(
    `\nDone: ${VEHICLES.length} vehicles and the showroom settings.\n` +
      'Replace the placeholder images and the address from /admin before going live.',
  );
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
