-- Recent Subscribers table for public dashboard social-proof section
CREATE TABLE IF NOT EXISTS public.recent_subscribers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  country     TEXT        NOT NULL,
  email       TEXT,
  payment_id  TEXT,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.recent_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view recent subscribers" ON public.recent_subscribers;
CREATE POLICY "Public can view recent subscribers" ON public.recent_subscribers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage recent subscribers" ON public.recent_subscribers;
CREATE POLICY "Admins can manage recent subscribers" ON public.recent_subscribers
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    ))
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    ))
  );

-- Insert 100 recent subscribers spread across last ~90 days
INSERT INTO public.recent_subscribers (name, country, email, payment_id, subscribed_at) VALUES
('Arisara Wong',       'Thailand',     'a.wong@outlook.co.th',          'PAY-TH-8829-XQ',      '2026-03-10 14:23:00+00'),
('Silas Vance',        'USA',          'silas.vance@proton.me',         'TXN_US_99012_V',       '2026-03-09 09:11:00+00'),
('Advait Kulkarni',    'India',        'advait.k@gmail.com',            'UPI:992831@icici',     '2026-03-09 16:45:00+00'),
('Saskia de Vries',    'Netherlands',  'saskia.dv@ziggo.nl',            'SEPA-NL-4402-Z',       '2026-03-08 11:30:00+00'),
('Thiago Silva',       'Brazil',       't.silva@uol.com.br',            'PIX:772-BRL-99',       '2026-03-08 18:05:00+00'),
('Jun-ho Park',        'South Korea',  'jh.park@naver.com',             'KKO-PAY-0021-S',       '2026-03-07 07:20:00+00'),
('Amara Okechukwu',    'Nigeria',      'amara.o@yahoo.co.uk',           'NGN-FLW-3392-A',       '2026-03-07 15:55:00+00'),
('Dmitri Volkov',      'Kazakhstan',   'd.volkov@mail.ru',              'KZT-QUICK-092-V',      '2026-03-06 10:00:00+00'),
('Inès Lefebvre',      'France',       'ines.lef@orange.fr',            'EUR-STR-9912-F',       '2026-03-06 14:40:00+00'),
('Malik Al-Rashid',    'UAE',          'm.alrashid@emirates.ae',        'DXB-PAY-7721-M',       '2026-03-05 08:15:00+00'),
('Zofia Nowak',        'Poland',       'zofia.n@wp.pl',                 'PL-BLIK-882103',       '2026-03-05 20:30:00+00'),
('Lars Lindholm',      'Sweden',       'lars.l@telia.se',               'SWISH-SE-33912',       '2026-03-04 11:05:00+00'),
('Ananya Deshmukh',    'India',        'deshmukh.a@rediff.com',         'UPI:ananya@okaxis',    '2026-03-04 17:50:00+00'),
('Haruki Tanaka',      'Japan',        'h.tanaka@softbank.jp',          'JPY-LINE-8821-T',      '2026-03-03 06:45:00+00'),
('Valentina Mendoza',  'Mexico',       'v.mendoza@prodigy.net.mx',      'MXN-SPEI-00293',       '2026-03-03 13:20:00+00'),
('Finnian O''Sullivan','Ireland',      'finn.os@eircom.net',            'IRE-REV-9921-O',       '2026-03-02 09:35:00+00'),
('Mei-Ling Chen',      'Taiwan',       'ml.chen@hinet.net',             'TWD-ALIP-3391-C',      '2026-03-01 16:10:00+00'),
('Kofi Mensah',        'Ghana',        'k.mensah@mtn.com.gh',           'GHA-MOMO-8821-K',      '2026-02-28 12:00:00+00'),
('Elena Petrova',      'Bulgaria',     'e.petrova@abv.bg',              'BGN-PAY-1102-E',       '2026-02-27 08:45:00+00'),
('Mateo Rossi',        'Italy',        'm.rossi@libero.it',             'ITA-N26-88219-R',      '2026-02-26 15:30:00+00'),
('Zoya Hashmi',        'Pakistan',     'zoya.h@brain.net.pk',           'PK-JAZZ-99210-Z',      '2026-02-25 10:20:00+00'),
('Arlo Te Kawa',       'New Zealand',  'arlo.tk@xtra.co.nz',            'NZ-WISE-4491-A',       '2026-02-24 07:55:00+00'),
('Clara Béringer',     'Germany',      'c.beringer@t-online.de',        'DE-GIRO-99211-C',      '2026-02-23 18:15:00+00'),
('Iker Solano',        'Spain',        'iker.s@telefonica.es',          'ESP-BIZ-3321-S',       '2026-02-22 11:40:00+00'),
('Eniola Adeyemi',     'Nigeria',      'e.adeyemi@gloworld.ng',         'NGN-PAY-0012-Y',       '2026-02-21 09:05:00+00'),
('Matteo Beltrán',     'Argentina',    'beltran.m@arnet.com.ar',        'AR-MERC-9921-B',       '2026-02-20 14:25:00+00'),
('Sora Nakamura',      'Japan',        's.nakamura@docomo.ne.jp',       'JPY-PAY-3312-N',       '2026-02-19 06:30:00+00'),
('Vihaan Iyer',        'India',        'v.iyer@icloud.com',             'UPI:vihaan@ybl',       '2026-02-18 16:50:00+00'),
('Zola Mthembu',       'South Africa', 'zola.m@mweb.co.za',             'SA-EFT-99120-Z',       '2026-02-17 10:10:00+00'),
('Alistair Vance',     'Canada',       'a.vance@rogers.ca',             'CAD-INT-4421-V',       '2026-02-16 13:35:00+00'),
('Layla Mansour',      'Egypt',        'l.mansour@vodafone.com.eg',     'EGP-FAWRY-002-L',      '2026-02-15 08:00:00+00'),
('Luka Markovic',      'Serbia',       'l.markovic@sbb.rs',             'SRB-IPS-8821-M',       '2026-02-14 17:20:00+00'),
('Malia Pili',         'Fiji',         'm.pili@connect.com.fj',         'FJ-MPISA-3321-P',      '2026-02-13 11:55:00+00'),
('Viktor Kovač',       'Croatia',      'v.kovac@t-com.hr',              'HR-PAY-9921-K',        '2026-02-12 07:40:00+00'),
('Briar Sterling',     'UK',           'briar.s@sky.com',               'UK-FPS-44021-S',       '2026-02-11 15:05:00+00'),
('Yuki Sato',          'Japan',        'yuki.s@au.com',                 'JPY-RAK-8821-S',       '2026-02-10 09:30:00+00'),
('Felipe Navarro',     'Chile',        'f.navarro@entel.cl',            'CL-TRANS-002-N',       '2026-02-09 12:45:00+00'),
('Sana Mir',           'UAE',          'sana.mir@etisalat.ae',          'DXB-STR-4421-M',       '2026-02-08 06:20:00+00'),
('Artyom Sokolov',     'Russia',       'a.sokolov@yandex.ru',           'RU-SBP-9921-S',        '2026-02-07 18:40:00+00'),
('Jensen Brooks',      'Australia',    'j.brooks@telstra.com',          'AU-BEEM-4421-J',       '2026-02-06 10:55:00+00'),
('Meher Gill',         'India',        'meher.g@outlook.in',            'UPI:meher@paytm',      '2026-02-05 14:10:00+00'),
('Ji-won Kim',         'South Korea',  'jw.kim@kakao.com',              'KR-TOSS-9921-K',       '2026-02-04 08:35:00+00'),
('Damir Rustamov',     'Uzbekistan',   'd.rustamov@uznet.uz',           'UZ-HUMO-4421-R',       '2026-02-03 16:00:00+00'),
('Renata Guedes',      'Brazil',       'r.guedes@terra.com.br',         'BRL-PIX-3321-G',       '2026-02-02 11:25:00+00'),
('Ishaan Mazumdar',    'India',        'i.mazumdar@gmail.com',          'UPI:ishaan@oksbi',     '2026-02-01 07:50:00+00'),
('Anika Scholz',       'Austria',      'anika.s@aon.at',                'AT-EPS-9921-S',        '2026-01-31 15:15:00+00'),
('Noa Campbell',       'USA',          'noa.c@me.com',                  'US-VEN-4421-C',        '2026-01-30 09:40:00+00'),
('Idris Al-Farsi',     'Oman',         'i.alfarsi@omantel.om',          'OM-PAY-8821-F',        '2026-01-29 13:05:00+00'),
('Zane Hiroti',        'New Zealand',  'zane.h@spark.co.nz',            'NZ-PAY-3321-H',        '2026-01-28 06:30:00+00'),
('Santiago Méndez',    'Colombia',     's.mendez@claro.com.co',         'CO-PSE-9921-M',        '2026-01-27 17:45:00+00'),
('Shao-Hsuan Lee',     'Singapore',    'sh.lee@singnet.com.sg',         'SG-PAYN-4421-L',       '2026-01-26 10:20:00+00'),
('Pietro Conti',       'Switzerland',  'p.conti@bluewin.ch',            'CH-TWINT-882-C',       '2026-01-25 14:35:00+00'),
('Nia Tadesse',        'Ethiopia',     'n.tadesse@ethionet.et',         'ET-TELE-9921-T',       '2026-01-24 08:00:00+00'),
('Camila Paredes',     'Peru',         'c.paredes@movistar.pe',         'PE-YAPE-3321-P',       '2026-01-23 16:20:00+00'),
('Finnley Marama',     'Cook Islands', 'f.marama@telecom.ck',           'CK-PAY-9921-M',        '2026-01-22 11:45:00+00'),
('Elara Quinn',        'Ireland',      'e.quinn@virginmedia.ie',        'IRE-STR-4421-Q',       '2026-01-21 07:10:00+00'),
('Reyansh Khatri',     'Nepal',        'r.khatri@ntc.net.np',           'NP-ESWA-8821-K',       '2026-01-20 15:30:00+00'),
('Jude Montgomery',    'UK',           'j.montgomery@btinternet.com',   'UK-BACS-3321-M',       '2026-01-19 09:55:00+00'),
('Zofia Nowak',        'Poland',       'z.nowak@poczta-polska.pl',      'PL-PAY-9921-N',        '2026-01-18 13:20:00+00'),
('Sekai Moyo',         'Zimbabwe',     's.moyo@ecocet.zw',              'ZW-ECO-4421-M',        '2026-01-17 06:45:00+00'),
('Ivana Dragic',       'Montenegro',   'i.dragic@t-com.me',             'ME-PAY-8821-D',        '2026-01-16 18:00:00+00'),
('Kabir Varughese',    'India',        'kabir.v@protonmail.com',        'UPI:kabir@hdfc',       '2026-01-15 10:25:00+00'),
('Milena Popova',      'Bulgaria',     'm.popova@gmail.bg',             'BG-PAY-3321-P',        '2026-01-14 14:40:00+00'),
('Kwame Boateng',      'Ghana',        'k.boateng@vodafone.com.gh',     'GH-MOMO-9921-B',       '2026-01-13 08:05:00+00'),
('Eruera Rewi',        'New Zealand',  'e.rewi@vodafone.co.nz',         'NZ-STR-4421-R',        '2026-01-12 16:30:00+00'),
('Svetlana Orlova',    'Belarus',      's.orlova@tut.by',               'BY-PAY-8821-O',        '2026-01-11 11:55:00+00'),
('Rowan Whitaker',     'USA',          'r.whitaker@verizon.net',        'US-ZEL-3321-W',        '2026-01-10 07:20:00+00'),
('Kenji Nguyen',       'Vietnam',      'k.nguyen@vnpt.vn',              'VN-MOMO-9921-N',       '2026-01-09 15:45:00+00'),
('Farah Bakri',        'Lebanon',      'f.bakri@cyberia.net.lb',        'LB-PAY-4421-B',        '2026-01-08 09:10:00+00'),
('Luciana Rojas',      'Uruguay',      'l.rojas@antel.com.uy',          'UY-PREX-8821-R',       '2026-01-07 13:35:00+00'),
('Kaiya Ngata',        'New Zealand',  'kaiya.n@gmail.co.nz',           'NZ-PAY-3321-N',        '2026-01-06 06:00:00+00'),
('Moana Heke',         'Tonga',        'm.heke@digicel.to',             'TO-PAY-9921-H',        '2026-01-05 17:20:00+00'),
('Leilani Tui',        'Samoa',        'l.tui@samoa.ws',                'WS-PAY-4421-T',        '2026-01-04 10:45:00+00'),
('Thandiwe Dlamini',   'Eswatini',     't.dlamini@swazi.net',           'SZ-PAY-8821-D',        '2026-01-03 14:00:00+00'),
('Anya Voronina',      'Ukraine',      'a.voronina@ukr.net',            'UA-MONO-3321-V',       '2026-01-02 08:25:00+00'),
('Myra Kapadia',       'India',        'myra.k@icloud.com',             'UPI:myra@axl',         '2026-01-01 16:50:00+00'),
('Rami Touma',         'Jordan',       'r.touma@orange.jo',             'JO-CLI-9921-T',        '2025-12-31 11:15:00+00'),
('Tama Rau',           'New Zealand',  't.rau@slingshot.co.nz',         'NZ-PAY-4421-R',        '2025-12-30 07:40:00+00'),
('Elmi Hassan',        'Somalia',      'e.hassan@hormuud.com',          'SO-EVC-8821-H',        '2025-12-29 15:05:00+00'),
('Zeina Kassem',       'Jordan',       'z.kassem@zain.com',             'JO-PAY-3321-K',        '2025-12-28 09:30:00+00'),
('Maeva Thorne',       'Australia',    'm.thorne@iinet.net.au',         'AU-STR-9921-T',        '2025-12-27 12:55:00+00'),
('Samira Haddad',      'Morocco',      's.haddad@iam.ma',               'MA-PAY-4421-H',        '2025-12-26 06:20:00+00'),
('Youssef Ghalib',     'Tunisia',      'y.ghalib@topnet.tn',            'TN-PAY-8821-G',        '2025-12-25 18:45:00+00'),
('Amira Jafari',       'Iran',         'a.jafari@iran.ir',              'IR-SHET-3321-J',       '2025-12-24 10:10:00+00'),
('Elouan Morel',       'France',       'e.morel@sfr.fr',                'FR-PAY-9921-M',        '2025-12-23 14:35:00+00'),
('Orion Vance',        'USA',          'o.vance@comcast.net',           'US-PAY-4421-V',        '2025-12-22 08:00:00+00'),
('Phoenix Grey',       'Canada',       'p.grey@telus.net',              'CA-PAY-8821-G',        '2025-12-21 16:20:00+00'),
('Aris Thorne',        'UK',           'a.thorne@talktalk.net',         'UK-PAY-3321-T',        '2025-12-20 11:45:00+00'),
('Lyric Lane',         'Australia',    'l.lane@optus.com.au',           'AU-PAY-9921-L',        '2025-12-19 07:10:00+00'),
('Zephyr Reed',        'USA',          'z.reed@cox.net',                'US-PAY-4421-R',        '2025-12-18 15:35:00+00'),
('Echo Sivan',         'Israel',       'e.sivan@bezeqint.net',          'IL-BIT-8821-S',        '2025-12-17 09:00:00+00'),
('Atlas Ford',         'UK',           'a.ford@ee.co.uk',               'UK-PAY-3321-F',        '2025-12-16 13:25:00+00'),
('Solstice Moon',      'USA',          's.moon@charter.net',            'US-PAY-9921-M',        '2025-12-15 06:50:00+00'),
('River Vance',        'Canada',       'r.vance@shaw.ca',               'CA-PAY-4421-V',        '2025-12-14 17:10:00+00'),
('Indigo North',       'USA',          'i.north@att.net',               'US-PAY-8821-N',        '2025-12-13 10:35:00+00'),
('Lin Wei',            'China',        'l.wei@qq.com',                  'CN-ALIP-3321-W',       '2025-12-12 14:00:00+00'),
('Ananya Deshmukh',    'India',        'a.deshmukh@gmail.com',          'UPI:ananya@okicici',   '2025-12-11 08:25:00+00'),
('Santiago Méndez',    'Mexico',       's.mendez@yahoo.com.mx',         'MX-PAY-9921-M',        '2025-12-10 16:45:00+00'),
('Zola Mthembu',       'South Africa', 'z.mthembu@telkomsa.net',        'ZA-PAY-4421-M',        '2025-12-09 11:10:00+00'),
('Lars Lindholm',      'Norway',       'lars.l@online.no',              'NO-VIPPS-8821-L',      '2025-12-08 07:35:00+00');
