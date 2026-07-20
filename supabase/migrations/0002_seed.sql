-- ============================================================================
-- Toastrack — seed data for the lookup tables (list_pais, list_bjcp_21).
-- Idempotent: safe to run more than once (adds unique keys if missing, then
-- inserts with ON CONFLICT DO NOTHING).
--
-- Flags: pais_img uses flagcdn.com SVG URLs (real flags with zero setup). To go
-- fully self-hosted later, upload flags to Supabase Storage and swap these URLs.
-- Subdivision flags (England/Scotland) use flagcdn's gb-eng / gb-sct codes.
--
-- BJCP (list_bjcp_21) — per the product owner, this table has 2 fields:
--   * bjcp21_id  — numeric identity PK (the stable key that beer.bjcp21_id points to)
--   * bjcp21_cod — the alphanumeric label, e.g. "01A - American Light Lager"
-- Changes vs migration 0001: widen bjcp21_cod int->text and DROP bjcp21_subestilo
-- (its content is folded into bjcp21_cod). If you ran an earlier version of this
-- seed, run `delete from list_bjcp_21;` first (safe while no beers reference it).
-- ============================================================================

-- Reshape list_bjcp_21 to the 2-field design.
alter table list_bjcp_21 alter column bjcp21_cod type text using bjcp21_cod::text;
alter table list_bjcp_21 drop column if exists bjcp21_subestilo;

-- Unique keys so the inserts below can be conflict-free on re-run.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'list_pais_nome_key') then
    alter table list_pais add constraint list_pais_nome_key unique (pais_nome);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'list_bjcp_21_cod_key') then
    alter table list_bjcp_21 add constraint list_bjcp_21_cod_key unique (bjcp21_cod);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Countries (PT names) + flag URLs
-- ---------------------------------------------------------------------------
insert into list_pais (pais_nome, pais_img) values
  ('África do Sul',      'https://flagcdn.com/za.svg'),
  ('Alemanha',           'https://flagcdn.com/de.svg'),
  ('Argentina',          'https://flagcdn.com/ar.svg'),
  ('Austrália',          'https://flagcdn.com/au.svg'),
  ('Áustria',            'https://flagcdn.com/at.svg'),
  ('Bélgica',            'https://flagcdn.com/be.svg'),
  ('Brasil',             'https://flagcdn.com/br.svg'),
  ('Canadá',             'https://flagcdn.com/ca.svg'),
  ('Chile',              'https://flagcdn.com/cl.svg'),
  ('China',              'https://flagcdn.com/cn.svg'),
  ('Coreia do Sul',      'https://flagcdn.com/kr.svg'),
  ('Croácia',            'https://flagcdn.com/hr.svg'),
  ('Cuba',               'https://flagcdn.com/cu.svg'),
  ('Dinamarca',          'https://flagcdn.com/dk.svg'),
  ('Escócia',            'https://flagcdn.com/gb-sct.svg'),
  ('Espanha',            'https://flagcdn.com/es.svg'),
  ('Estados Unidos',     'https://flagcdn.com/us.svg'),
  ('França',             'https://flagcdn.com/fr.svg'),
  ('Geórgia',            'https://flagcdn.com/ge.svg'),
  ('Grécia',             'https://flagcdn.com/gr.svg'),
  ('Holanda',            'https://flagcdn.com/nl.svg'),
  ('Hungria',            'https://flagcdn.com/hu.svg'),
  ('Índia',              'https://flagcdn.com/in.svg'),
  ('Inglaterra',         'https://flagcdn.com/gb-eng.svg'),
  ('Irlanda',            'https://flagcdn.com/ie.svg'),
  ('Itália',             'https://flagcdn.com/it.svg'),
  ('Japão',              'https://flagcdn.com/jp.svg'),
  ('México',             'https://flagcdn.com/mx.svg'),
  ('Noruega',            'https://flagcdn.com/no.svg'),
  ('Nova Zelândia',      'https://flagcdn.com/nz.svg'),
  ('Peru',               'https://flagcdn.com/pe.svg'),
  ('Polônia',            'https://flagcdn.com/pl.svg'),
  ('Portugal',           'https://flagcdn.com/pt.svg'),
  ('Reino Unido',        'https://flagcdn.com/gb.svg'),
  ('República Tcheca',   'https://flagcdn.com/cz.svg'),
  ('Romênia',            'https://flagcdn.com/ro.svg'),
  ('Rússia',             'https://flagcdn.com/ru.svg'),
  ('Suécia',             'https://flagcdn.com/se.svg'),
  ('Suíça',              'https://flagcdn.com/ch.svg'),
  ('Uruguai',            'https://flagcdn.com/uy.svg')
on conflict (pais_nome) do nothing;

-- ---------------------------------------------------------------------------
-- BJCP 2021 styles (label = "code - name"), + X-series provisional and 999
-- ---------------------------------------------------------------------------
insert into list_bjcp_21 (bjcp21_cod) values
  ('01A - American Light Lager'),
  ('01B - American Lager'),
  ('01C - Cream Ale'),
  ('01D - American Wheat Beer'),
  ('02A - International Pale Lager'),
  ('02B - International Amber Lager'),
  ('02C - International Dark Lager'),
  ('03A - Czech Pale Lager'),
  ('03B - Czech Premium Pale Lager'),
  ('03C - Czech Amber Lager'),
  ('03D - Czech Dark Lager'),
  ('04A - Munich Helles'),
  ('04B - Festbier'),
  ('04C - Helles Bock'),
  ('05A - German Leichtbier'),
  ('05B - Kölsch'),
  ('05C - German Helles Exportbier'),
  ('05D - German Pils'),
  ('06A - Märzen'),
  ('06B - Rauchbier'),
  ('06C - Dunkles Bock'),
  ('07A - Vienna Lager'),
  ('07B - Altbier'),
  ('08A - Munich Dunkel'),
  ('08B - Schwarzbier'),
  ('09A - Doppelbock'),
  ('09B - Eisbock'),
  ('09C - Baltic Porter'),
  ('10A - Weissbier'),
  ('10B - Dunkles Weissbier'),
  ('10C - Weizenbock'),
  ('11A - Ordinary Bitter'),
  ('11B - Best Bitter'),
  ('11C - Strong Bitter'),
  ('12A - British Golden Ale'),
  ('12B - Australian Sparkling Ale'),
  ('12C - English IPA'),
  ('13A - Dark Mild'),
  ('13B - British Brown Ale'),
  ('13C - English Porter'),
  ('14A - Scottish Light'),
  ('14B - Scottish Heavy'),
  ('14C - Scottish Export'),
  ('15A - Irish Red Ale'),
  ('15B - Irish Stout'),
  ('15C - Irish Extra Stout'),
  ('16A - Sweet Stout'),
  ('16B - Oatmeal Stout'),
  ('16C - Tropical Stout'),
  ('16D - Foreign Extra Stout'),
  ('17A - British Strong Ale'),
  ('17B - Old Ale'),
  ('17C - Wee Heavy'),
  ('17D - English Barleywine'),
  ('18A - Blonde Ale'),
  ('18B - American Pale Ale'),
  ('19A - American Amber Ale'),
  ('19B - California Common'),
  ('19C - American Brown Ale'),
  ('20A - American Porter'),
  ('20B - American Stout'),
  ('20C - Imperial Stout'),
  ('21A - American IPA'),
  ('21B - Specialty IPA'),
  ('21B - Specialty IPA: Rye IPA'),
  ('21B - Specialty IPA: White IPA'),
  ('21B - Specialty IPA: Brown IPA'),
  ('21B - Specialty IPA: Red IPA'),
  ('21B - Specialty IPA: Black IPA'),
  ('21B - Specialty IPA: Belgian IPA'),
  ('21B - Specialty IPA: Brut IPA'),
  ('21C - Hazy IPA'),
  ('22A - Double IPA'),
  ('22B - American Strong Ale'),
  ('22C - American Barleywine'),
  ('22D - Wheatwine'),
  ('23A - Berliner Weisse'),
  ('23B - Flanders Red Ale'),
  ('23C - Oud Bruin'),
  ('23D - Lambic'),
  ('23E - Gueuze'),
  ('23F - Fruit Lambic'),
  ('23G - Gose'),
  ('24A - Witbier'),
  ('24B - Belgian Pale Ale'),
  ('24C - Bière de Garde'),
  ('25A - Belgian Blond Ale'),
  ('25B - Saison'),
  ('25C - Belgian Golden Strong Ale'),
  ('26A - Belgian Single'),
  ('26B - Belgian Dubbel'),
  ('26C - Belgian Tripel'),
  ('26D - Belgian Dark Strong Ale'),
  ('27A - Historical Beer: Kellerbier'),
  ('27A - Historical Beer: Kentucky Common'),
  ('27A - Historical Beer: Lichtenhainer'),
  ('27A - Historical Beer: London Brown Ale'),
  ('27A - Historical Beer: Piwo Grodziskie'),
  ('27A - Historical Beer: Pre-Prohibition Lager'),
  ('27A - Historical Beer: Pre-Prohibition Porter'),
  ('27A - Historical Beer: Roggenbier'),
  ('27A - Historical Beer: Sahti'),
  ('28A - Brett Beer'),
  ('28B - Mixed-Fermentation Sour Beer'),
  ('28C - Wild Specialty Beer'),
  ('28D - Straight Sour Beer'),
  ('29A - Fruit Beer'),
  ('29B - Fruit and Spice Beer'),
  ('29C - Specialty Fruit Beer'),
  ('29D - Grape Ale'),
  ('30A - Spice, Herb, or Vegetable Beer'),
  ('30B - Autumn Seasonal Beer'),
  ('30C - Winter Seasonal Beer'),
  ('30D - Specialty Spice Beer'),
  ('31A - Alternative Grain Beer'),
  ('31B - Alternative Sugar Beer'),
  ('32A - Classic Style Smoked Beer'),
  ('32B - Specialty Smoked Beer'),
  ('33A - Wood-Aged Beer'),
  ('33B - Specialty Wood-Aged Beer'),
  ('34A - Commercial Specialty Beer'),
  ('34B - Mixed-Style Beer'),
  ('34C - Experimental Beer'),
  ('X1 - Dorada Pampeana'),
  ('X2 - IPA Argenta'),
  ('X3 - Italian Grape Ale'),
  ('X4 - Catharina Sour'),
  ('X5 - New Zealand Pilsner'),
  ('999 - Bebida Mista')
on conflict (bjcp21_cod) do nothing;
