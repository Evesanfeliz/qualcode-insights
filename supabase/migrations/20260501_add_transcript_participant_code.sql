alter table public.transcripts
add column if not exists participant_code text;

update public.transcripts
set participant_code = case participant_pseudonym
  when 'Aleksa' then 'INT1'
  when 'Alexander' then 'INT2'
  when 'Andrej Kútny' then 'INT3'
  when 'Camilo' then 'INT4'
  when 'Cesar' then 'INT5'
  when 'Irina' then 'INT6'
  when 'Juan' then 'INT7'
  when 'Lassi' then 'INT8'
  when 'Liza Milasheuskaya' then 'INT9'
  when 'Mikael' then 'INT10'
  when 'Peter Samál' then 'INT11'
  when 'Pol' then 'INT12'
  when 'Radoslav Dosedel' then 'INT13'
  when 'Vladislav Vereshchagin' then 'INT14'
  else participant_code
end
where participant_pseudonym in (
  'Aleksa',
  'Alexander',
  'Andrej Kútny',
  'Camilo',
  'Cesar',
  'Irina',
  'Juan',
  'Lassi',
  'Liza Milasheuskaya',
  'Mikael',
  'Peter Samál',
  'Pol',
  'Radoslav Dosedel',
  'Vladislav Vereshchagin'
);
