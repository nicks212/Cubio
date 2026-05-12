import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

export type T = Record<string, string>;

export const DEFAULT_TRANSLATIONS: T = {
  // === NAVIGATION ===
  'nav.sign_in': 'შესვლა',
  'nav.get_started': 'დაწყება',
  'nav.dashboard': 'დაფა',
  'nav.conversations': 'საუბრები',
  'nav.projects': 'პროექტები',
  'nav.apartments': 'ბინები',
  'nav.products': 'პროდუქტები',
  'nav.integrations': 'ინტეგრაციები',
  'nav.settings': 'პარამეტრები',
  'nav.admin': 'ადმინი',
  'nav.sign_out': 'გამოსვლა',

  // === LANDING ===
  'landing.badge': 'AI-ზე დაფუძნებული გაყიდვების ავტომატიზაცია',
  'landing.hero_title': 'AI-ზე დაფუძნებული ბიზნეს ავტომატიზაციის პლატფორმა',
  'landing.hero_subtitle': 'Cubio ოპტიმიზებს თქვენი ბიზნეს პროცესებს ინტელექტური ავტომატიზაციით. მართეთ ინვენტარი, თვალყური ადევნეთ ლიდებს და ავტომატიზირეთ კლიენტებთან კომუნიკაცია 24/7.',
  'landing.cta_start': 'დაიწყეთ უფასოდ',
  'landing.industry_title': 'თქვენი ინდუსტრიისთვის შექმნილი',
  'landing.industry_subtitle': 'Cubio ადაპტირდება თქვენი სპეციფიკური ბიზნეს ტიპისთვის მორგებული AI სამუშაო ნაკადებით',
  'landing.re_title': 'უძრავი ქონების დეველოპმენტი',
  'landing.re_desc': 'მართეთ პროექტები, ბინები, ლიდები და AI-ზე დაფუძნებული გაყიდვების ავტომატიზაცია',
  'landing.craft_title': 'Birthstone Crafts Shop',
  'landing.craft_desc': 'მართეთ პროდუქტის კატალოგი, birthstone სამკაულები და zodiac თავსებადობა',

  // === LANDING – HOW IT WORKS ===
  'landing.how_title': 'როგორ მუშაობს Cubio',
  'landing.how_subtitle': 'სამი მარტივი ნაბიჯი კლიენტებთან კომუნიკაციის ავტომატიზაციისთვის',
  'landing.step1_title': 'არხების დაკავშირება',
  'landing.step1_desc': 'დააკავშირეთ Facebook, Instagram, Telegram, WhatsApp ან Viber ანგარიშები რამდენიმე წუთში.',
  'landing.step2_title': 'AI სწავლობს თქვენს ბიზნესს',
  'landing.step2_desc': 'კონფიგურირეთ კატალოგი, ფასები და AI პასუხები. Cubio გაიგებს თქვენს პროდუქტებს და კლიენტებს.',
  'landing.step3_title': 'ავტომატიზაცია და ზრდა',
  'landing.step3_desc': 'AI ამუშავებს მოთხოვნებს 24/7. თქვენ ხვდებით ლიდებს, ადევნებთ თვალყურს საუბრებს და ხურავთ გარიგებებს.',

  // === LANDING – WHY CUBIO ===
  'landing.why_title': 'რატომ ირჩევენ Cubio-ს',
  'landing.why_subtitle': 'გაამარტივეთ ოპერაციები ინტელექტური ავტომატიზაციით',
  'landing.benefit1_title': 'მყისიერი პასუხები',
  'landing.benefit1_desc': 'AI აგენტები მყისიერად პასუხობენ კლიენტების მოთხოვნებზე — ყოველი შეტყობინება მუშავდება.',
  'landing.benefit2_title': '24/7 ხელმისაწვდომობა',
  'landing.benefit2_desc': 'სამუშაო საათების გარეთ მოთხოვნებს ვეღარ გამოტოვებთ. AI ასისტენტი მუშაობს მუდმივად.',
  'landing.benefit3_title': 'ჭკვიანი ავტომატიზაცია',
  'landing.benefit3_desc': 'ავტომატურად მართეთ ინვენტარი, კვალი ადევნეთ ლიდებს და კვალიფიკაცია გაუაწყეთ კლიენტებს.',
  'landing.benefit4_title': 'მაღალი ეფექტიანობა',
  'landing.benefit4_desc': 'გუნდი ფოკუსირდება მაღალი ღირებულების ამოცანებზე — AI ამუშავებს ყოველდღიურ ოპერაციებს.',

  // === LANDING – CTA & FOOTER ===
  'landing.cta_title': 'მზად ხართ ბიზნეს ტრანსფორმაციისთვის?',
  'landing.cta_subtitle': 'შეუერთდით ბიზნესებს, რომლებიც AI-ს იყენებენ ოპერაციების ავტომატიზაციისა და ეფექტიანობის გაუმჯობესებისთვის',
  'landing.cta_btn': 'უფასოდ დაიწყეთ',
  'landing.re_feat1': 'პროექტებისა და ბინების კატალოგი',
  'landing.re_feat2': 'ლიდების კვალიფიკაცია',
  'landing.re_feat3': 'სართულების მასიური მართვა',
  'landing.re_feat4': 'მრავალარხიანი AI გაყიდვები',
  'landing.craft_feat1': 'Birthstone პროდუქტის კატალოგი',
  'landing.craft_feat2': 'Zodiac თავსებადობა',
  'landing.craft_feat3': 'AI პროდუქტის რეკომენდაციები',
  'landing.craft_feat4': 'მრავალარხიანი შეტყობინება',

  // === AUTH – COMMON ===
  'auth.back_home': 'მთავარ გვერდზე დაბრუნება',
  'auth.back_login': 'შესვლაზე დაბრუნება',
  'auth.email': 'ელ. ფოსტა',
  'auth.email_placeholder': 'თქვენი@კომპანია.com',
  'auth.password': 'პაროლი',
  'auth.min_8': 'მინიმუმ 8 სიმბოლო',
  'auth.full_name': 'სრული სახელი',
  'auth.full_name_placeholder': 'გიორგი მამარდაშვილი',
  'auth.confirm_password': 'პაროლის დადასტურება',

  // === AUTH – LOGIN ===
  'auth.sign_in_title': 'კეთილი იყოს თქვენი მობრძანება Cubio-ში',
  'auth.sign_in_subtitle': 'შედით თქვენს ანგარიშში',
  'auth.remember_me': 'დამახსოვრება',
  'auth.forgot_password': 'დაგავიწყდათ პაროლი?',
  'auth.sign_in_btn': 'შესვლა',
  'auth.signing_in': 'შესვლა...',
  'auth.no_account': 'ანგარიში არ გაქვთ?',
  'auth.create_one': 'შექმენით',

  // === AUTH – REGISTER ===
  'auth.register_title': 'შექმენით ანგარიში',
  'auth.register_subtitle': 'დაიწყეთ ბიზნეს ავტომატიზაცია დღეს',
  'auth.create_account_btn': 'ანგარიშის შექმნა',
  'auth.creating_account': 'ანგარიში იქმნება...',
  'auth.have_account': 'უკვე გაქვთ ანგარიში?',
  'auth.sign_in_link': 'შედით',

  // === AUTH – FORGOT PASSWORD ===
  'auth.forgot_title': 'დაგავიწყდათ პაროლი',
  'auth.forgot_subtitle': 'შეიყვანეთ ელ. ფოსტა და ჩვენ გამოგიგზავნით აღდგენის ბმულს',
  'auth.send_reset': 'გაგზავნა',
  'auth.sending': 'იგზავნება...',
  'auth.reset_check_email': 'შეამოწმეთ ელ. ფოსტა გადატვირთვის ბმულისთვის',

  // === AUTH – RESET PASSWORD ===
  'auth.reset_title': 'დააყენეთ ახალი პაროლი',
  'auth.reset_subtitle': 'აირჩიეთ ძლიერი პაროლი თქვენი ანგარიშისთვის',
  'auth.new_password': 'ახალი პაროლი',
  'auth.confirm_new_password': 'ახალი პაროლის დადასტურება',
  'auth.update_password_btn': 'პაროლის განახლება',
  'auth.updating': 'განახლება...',
  'auth.password_updated_title': 'პაროლი განახლდა!',
  'auth.password_updated_msg': 'თქვენი პაროლი წარმატებით შეიცვალა.',
  'auth.sign_in_new_password': 'შედით ახალი პაროლით',

  // === AUTH – VERIFY EMAIL ===
  'auth.verify_title': 'შეამოწმეთ ელ. ფოსტა',
  'auth.verify_msg': 'ჩვენ გამოვგზავნეთ დადასტურების ბმული თქვენს ელ. ფოსტაზე. დააწკაპუნეთ ბმულზე ანგარიშის გასააქტიურებლად.',
  'auth.verify_no_email': 'ელ. ფოსტა ვერ მიიღეთ? შეამოწმეთ სპამის საქაღალდე, ან',
  'auth.verify_retry': 'სცადეთ სხვა მისამართით',

  // === AUTH – EMAIL CONFIRMED ===
  'auth.confirmed_title': 'ელ. ფოსტა დადასტურდა!',
  'auth.confirmed_msg': 'თქვენი ელ. ფოსტა წარმატებით დადასტურდა. გადადით კომპანიის დაყენებაზე.',
  'auth.continue_setup': 'დაყენების გაგრძელება',

  // === AUTH – UNCONFIRMED BANNER ===
  'auth.unconfirmed_title': 'ელ. ფოსტა არ დასტურდება',
  'auth.unconfirmed_msg': 'გთხოვთ, შეამოწმოთ შემოსული ფოსტა და დააწკაპუნოთ დადასტურების ბმულზე შესვლამდე.',
  'auth.resend_link': 'ელ. ფოსტა ვერ მიიღეთ? ხელახლა გაგზავნა',
  'auth.resending': 'იგზავნება...',
  'auth.resent_ok': 'დადასტურების ელ. ფოსტა გაიგზავნა! შეამოწმეთ შემოსული ფოსტა.',

  // === ONBOARDING ===
  'onboarding.title': 'დააყენეთ კომპანია',
  'onboarding.subtitle': 'მოგვიყევით თქვენი ბიზნესის შესახებ',
  'onboarding.company_name': 'კომპანიის სახელი',
  'onboarding.company_placeholder': 'ჩემი კომპანია შპს',
  'onboarding.select_type': 'აირჩიეთ ბიზნეს ტიპი',
  'onboarding.get_started': 'დაწყება',
  'onboarding.setting_up': 'მუშავდება...',
  'onboarding.sign_out': 'გამოსვლა',
  'onboarding.re_title': 'უძრავი ქონების დეველოპმენტი',
  'onboarding.re_desc': 'მართეთ პროექტები, ბინები, ლიდები და AI-ზე დაფუძნებული გაყიდვების ავტომატიზაცია',
  'onboarding.craft_title': 'Birthstone Crafts Shop',
  'onboarding.craft_desc': 'მართეთ პროდუქტის კატალოგი, birthstone სამკაულები და zodiac თავსებადობა',
  'onboarding.feat_projects': 'პროექტების მართვა',
  'onboarding.feat_apartments': 'ბინების კატალოგი',
  'onboarding.feat_leads': 'ლიდების თვალყურის დევნება',
  'onboarding.feat_ai_sales': 'AI გაყიდვების აგენტი',
  'onboarding.feat_products': 'პროდუქტის კატალოგი',
  'onboarding.feat_birthstone': 'Birthstone-ის მართვა',
  'onboarding.feat_zodiac': 'Zodiac თავსებადობა',
  'onboarding.feat_inventory': 'ინვენტარის თვალყური',

  // === DASHBOARD ===
  'dashboard.title': 'დაფის მიმოხილვა',
  'dashboard.subtitle': 'გააკონტროლეთ ბიზნეს მაჩვენებლები და AI აგენტის აქტივობა',
  'dashboard.total_leads': 'ლიდების სულ',
  'dashboard.vacant_units': 'თავისუფალი ბინები',
  'dashboard.reserved': 'დაჯავშნილი',
  'dashboard.sold': 'გაყიდული',
  'dashboard.total_products': 'სულ პროდუქტი',
  'dashboard.ai_conversations': 'AI საუბრები',
  'dashboard.conversion_rate': 'კონვერსიის მაჩვენებელი',
  'dashboard.recent_leads': 'ბოლო ლიდ-აქტივობა',
  'dashboard.no_leads': 'ლიდები ჯერ არ არის. ისინი გამოჩნდება, როდესაც AI საუბრები დაიწყება.',
  'dashboard.ai_label': 'AI',

  // === INTEGRATIONS ===
  'integrations.title': 'ინტეგრაციები',
  'integrations.subtitle': 'AI ასისტენტთან დაკავშირებული შეტყობინებების არხები',
  'integrations.connected': 'დაკავშირებულია',
  'integrations.not_connected': 'არ არის დაკავშირებული',
  'integrations.inactive': 'არააქტიური',

  // === SETTINGS ===
  'settings.title': 'პარამეტრები',
  'settings.subtitle': 'მართეთ თქვენი პროფილი და კომპანიის პარამეტრები',
  'settings.profile': 'პროფილი',
  'settings.full_name': 'სრული სახელი',
  'settings.email': 'ელ. ფოსტა',
  'settings.email_note': 'ელ. ფოსტა აქ ვერ შეიცვლება',
  'settings.save_profile': 'პროფილის შენახვა',
  'settings.company': 'კომპანია',
  'settings.company_name': 'კომპანიის სახელი',
  'settings.ai_enabled': 'AI ასისტენტის ჩართვა',
  'settings.ai_enabled_desc': 'AI ავტომატურად გასცემს პასუხს შემომავალ შეტყობინებებზე',
  'settings.save_company': 'კომპანიის შენახვა',
  'settings.change_password': 'პაროლის შეცვლა',
  'settings.new_password': 'ახალი პაროლი',
  'settings.confirm_password': 'პაროლის დადასტურება',
  'settings.update_password': 'პაროლის განახლება',
  'settings.saving': 'ინახება...',
  'settings.updating': 'განახლება...',
  'settings.saved': 'წარმატებით შენახულია',

  // === CONVERSATIONS ===
  'conversations.title': 'საუბრები',
  'conversations.search': 'ძიება...',
  'conversations.all': 'ყველა',
  'conversations.open': 'ღია',
  'conversations.closed': 'დახურული',
  'conversations.pending': 'მოლოდინი',
  'conversations.no_conversations': 'საუბრები არ არის',
  'conversations.select_hint': 'საუბრის სანახავად, მარცხნიდან აირჩიეთ',
  'conversations.type_message': 'შეტყობინების შეყვანა...',
  'conversations.ai_assistant': 'AI ასისტენტი',

  // === APARTMENTS ===
  'apartments.title': 'ბინები',
  'apartments.subtitle': 'პროექტების ბინების მართვა',
  'apartments.add': 'ბინის დამატება',
  'apartments.no_apartments': 'ბინები ჯერ არ არის',
  'apartments.status_vacant': 'თავისუფალი',
  'apartments.status_reserved': 'დაჯავშნილი',
  'apartments.status_sold': 'გაყიდული',
  'apartments.all': 'ყველა',
  'apartments.saving': 'ინახება...',
  'apartments.cancel': 'გაუქმება',

  // === ADMIN ===
  'admin.title': 'ადმინ პანელი',
  'admin.subtitle': 'მართეთ მომხმარებლები, კონტენტი და ინტეგრაციები',
  'admin.tab_users': 'მომხმარებლები',
  'admin.tab_localizations': 'ლოკალიზაციები',
  'admin.tab_integrations': 'ინტეგრაციები',
  'admin.webhook_title': 'Webhook URL',
  'admin.webhook_desc': 'ეს URL გამოიყენეთ თქვენი შეტყობინებების პლატფორმის პარამეტრებში:',
  'admin.add_integration': 'ინტეგრაციის დამატება',
  'admin.add_string': 'სტრიქონის დამატება',
  'admin.edit_integration': 'ინტეგრაციის რედაქტირება',
  'admin.edit_string': 'სტრიქონის რედაქტირება',
  'admin.col_name': 'სახელი',
  'admin.col_email': 'ელ. ფოსტა',
  'admin.col_company': 'კომპანია',
  'admin.col_business': 'ბიზნეს ტიპი',
  'admin.col_admin': 'ადმინი',
  'admin.col_joined': 'გაწევრება',
  'admin.col_key': 'გასაღები',
  'admin.col_text': 'ტექსტი',
  'admin.col_provider': 'პროვაიდერი',
  'admin.col_account': 'ანგარიში',
  'admin.col_status': 'სტატუსი',
  'admin.is_admin': 'ადმინი',
  'admin.is_user': 'მომხმარებელი',
  'admin.active': 'აქტიური',
  'admin.off': 'გამორთული',
  'admin.save': 'შენახვა',
  'admin.saving': 'ინახება...',
  'admin.cancel': 'გაუქმება',
  'admin.company_select': 'კომპანიის არჩევა...',
  'admin.provider_select': 'პროვაიდერის არჩევა...',
  'admin.access_token': 'წვდომის ტოკენი',
  'admin.refresh_token': 'განახლების ტოკენი',
  'admin.account_name': 'ანგარიშის სახელი',
  'admin.provider_account_id': 'პროვაიდერის ანგარიშის ID',
  'admin.is_active_label': 'აქტიური',
  'admin.key_label': 'გასაღები',
  'admin.text_label': 'ტექსტი',
  'admin.reset_to_default': 'ნაგულისხმევზე გადაბრუნება',
  'admin.delete_confirm': 'ინტეგრაცია წაიშლება. დარწმუნებული ხართ?',
  'admin.strings_count': 'სტრიქონი',
  'admin.search_localizations': 'ძიება გასაღებებში ან ტექსტში...',
  'admin.no_results': 'ლოკალიზაციები ვერ მოიძებნა',
  'admin.no_strings': 'ლოკალიზაციები ჯერ არ არის',
};

export const getTranslations = unstable_cache(
  async (): Promise<T> => {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('localizations')
        .select('keyword, localization_text');
      const overrides: T = {};
      for (const row of data ?? []) overrides[row.keyword] = row.localization_text;
      return { ...DEFAULT_TRANSLATIONS, ...overrides };
    } catch {
      return { ...DEFAULT_TRANSLATIONS };
    }
  },
  ['translations'],
  { tags: ['translations'] },
);
