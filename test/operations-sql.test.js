const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL: RLS, concorrência, auditoria e consumo atômico', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id bigint generated always as identity, bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert on storage.objects to authenticated;
    grant usage on sequence storage.objects_id_seq to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
  `);
  const migration = (name) =>
    readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
  await db.exec(migration('202610170001_book_profiles.sql'));
  await db.exec(migration('202610170002_operations.sql'));
  await db.exec(migration('202610170002_operations.sql'));
  await db.exec(migration('202610220003_pilot.sql'));
  await db.exec(migration('202610220003_pilot.sql'));
  await db.exec(migration('202610220004_user_management.sql'));
  await db.exec(migration('202610220004_user_management.sql'));
  await db.exec(migration('202610220005_finance.sql'));
  await db.exec(migration('202610220005_finance.sql'));
  await db.exec(migration('202610220006_finance_history.sql'));
  await db.exec(migration('202610220006_finance_history.sql'));
  const master = '11111111-1111-4111-8111-111111111111';
  const client = '22222222-2222-4222-8222-222222222222';
  const other = '33333333-3333-4333-8333-333333333333';
  const admin = '44444444-4444-4444-8444-444444444444';
  for (const [id, name, role, isMaster] of [
    [master, 'Mestre', 'adm', true],
    [client, 'Cliente', 'cliente', false],
    [other, 'Outro', 'cliente', false],
    [admin, 'Gestor', 'adm', false],
  ]) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@test.com`]);
    await db.query(
      'insert into public.book_profiles(id,nome,login,funcao,mestre) values($1,$2,$3,$4,$5)',
      [id, name, `${name}@test.com`, role, isMaster],
    );
  }
  await db.query(
    "insert into public.book_hotel_access values($1,'Unlimited'),($2,'Unlimited'),($3,'Unique')",
    [client, other, admin],
  );
  const actor = async (id) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('set role authenticated');
  };
  const commit = (changes) =>
    db.query('select public.book_commit($1::jsonb)', [JSON.stringify(changes)]);
  const change = (collection, id, data, version = 0) => ({
    collection,
    id: String(id),
    data,
    version,
  });
  const ticket = (id) => ({
    id,
    hotel: 'Unlimited',
    apartamento: '1111',
    assunto: 'Vazamento',
    descricao: 'Torneira com vazamento',
    status: 'Aberto',
  });
  await actor(client);
  await commit([change('chamados', 101, ticket(101))]);
  const row = (await db.query("select * from public.book_records where id='101'")).rows[0];
  assert.equal(row.owner_id, client);
  assert.equal(row.data.criadaPorLogin, 'Cliente@test.com');
  await assert.rejects(
    commit([change('chamados', 101, ticket(101))]),
    (error) => error.code === 'PT409',
  );
  await assert.rejects(
    commit([change('chamados', 101, { ...row.data, status: 'Fechado' }, 1)]),
    (error) => error.code === '42501',
  );
  await assert.rejects(
    commit([change('chamados', 102, { ...ticket(102), hotel: 'Unique' })]),
    (error) => error.code === '42501',
  );
  await assert.rejects(
    db.exec("update public.book_profiles set funcao='adm'"),
    (error) => error.code === '42501',
  );
  await assert.rejects(
    db.exec(
      "insert into public.book_records values('chamados','evil','{}','" +
        client +
        "','Unlimited',1,now())",
    ),
    (error) => error.code === '42501',
  );
  await actor(other);
  assert.equal((await db.query('select * from public.book_records')).rows.length, 0);
  await actor(admin);
  assert.equal((await db.query('select * from public.book_records')).rows.length, 0);
  await actor(master);
  assert.equal((await db.query('select public.book_schema_version() version')).rows[0].version, 3);
  await assert.rejects(
    commit([change('chamados', 104, { ...ticket(104), apartamento: '9999' })]),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    commit([
      change('ordensServico', 204, {
        id: 204,
        hotel: 'Unlimited',
        apartamento: '1111',
        titulo: 'Teste',
        status: 'Aberta',
        vencimento: '2026-02-30',
      }),
    ]),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    commit([
      change('ordensServico', 204, {
        id: 204,
        hotel: 'Unlimited',
        apartamento: '1111',
        titulo: 'Teste',
        status: 'Aberta',
        vencimento: '2026-10-<img src=x onerror=alert(1)>',
      }),
    ]),
    (error) => error.code === '22023',
  );
  const inspection = {
    id: 301,
    hotel: 'Unlimited',
    apartamento: '1111',
    data: '2026-10-22',
    responsavel: 'Gestor',
    tipo: 'Completa',
    checklist: { Sala: { Porta: 'Em ordem' } },
    fotos: [],
  };
  await commit([change('vistorias', 301, inspection)]);
  await assert.rejects(
    commit([
      change('vistorias', 302, {
        ...inspection,
        id: 302,
        checklist: { Sala: { Porta: 'inventado' } },
      }),
    ]),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    commit([change('vistorias', 302, { ...inspection, id: 302, data: '2026-02-30' })]),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    commit([
      change('chamados', 104, {
        ...ticket(104),
        anexoData: `/api/files/${client}/Unlimited/11111111-1111-4111-8111-111111111111`,
      }),
    ]),
    (error) => error.code === '22023',
  );
  const stock = {
    colunas: [],
    itens: [{ id: 'material', nome: 'Torneira', quantidade: 10, valor: 2 }],
  };
  await commit([change('estoqueBookSantos', 'singleton', stock)]);
  const order = (id, quantity) => ({
    id,
    hotel: 'Unlimited',
    apartamento: '1111',
    titulo: 'Conserto',
    status: 'Em andamento',
    fechamento: { materiais: [{ id: 'material', quantidade: quantity }] },
  });
  await commit([change('ordensServico', 201, order(201, 4))]);
  const quantity = async () =>
    (
      await db.query(
        "select data#>'{itens,0,quantidade}' quantity from public.book_records where collection='estoqueBookSantos'",
      )
    ).rows[0].quantity;
  assert.equal(await quantity(), 6);
  await assert.rejects(
    commit([change('ordensServico', 201, order(201, 5))]),
    (error) => error.code === 'PT409',
  );
  assert.equal(await quantity(), 6);
  await assert.rejects(
    commit([change('ordensServico', 202, order(202, 7))]),
    (error) => error.code === 'PT409',
  );
  assert.equal(await quantity(), 6);
  assert.equal((await db.query("select * from public.book_records where id='202'")).rows.length, 0);
  await assert.rejects(
    commit([change('chamados', 103, ticket(103)), change('ordensServico', 203, order(203, 99))]),
    (error) => error.code === 'PT409',
  );
  assert.equal((await db.query("select * from public.book_records where id='103'")).rows.length, 0);
  await commit([change('ordensServico', 201, order(201, 2), 1)]);
  assert.equal(await quantity(), 8);
  await assert.rejects(
    commit([change('estoqueBookSantos', 'singleton', { colunas: [], itens: [] }, 3)]),
    /removido/,
  );
  const completed = {
    ...order(201, 2),
    status: 'Finalizada',
    fechamento: {
      ...order(201, 2).fechamento,
      data: '2026-10-17',
      executadoPorLogin: 'Mestre@test.com',
      responsavelPagamento: 'Book Santos',
      valorServico: 5,
    },
  };
  await commit([change('ordensServico', 201, completed, 2)]);
  const completedRow = (await db.query("select data from public.book_records where id='201'"))
    .rows[0];
  assert.equal(completedRow.data.fechamento.custoTotal, '9.00');
  await assert.rejects(
    commit([change('ordensServico', 201, order(201, 2), 3)]),
    (error) => error.code === '42501',
  );
  const priced = (id, value, hotel = 'Unlimited', payer = 'Book Santos') => ({
    id,
    hotel,
    apartamento: '1111',
    titulo: 'Resumo decimal',
    descricao: 'Teste financeiro',
    status: 'Em andamento',
    fechamento: {
      data: id === 211 ? '2026-10-23' : '2026-10-22',
      valorServico: value,
      valorMaterial: '0.00',
      responsavelPagamento: payer,
    },
  });
  await commit([
    change('ordensServico', 210, priced(210, '0.10')),
    change('ordensServico', 211, priced(211, '0.20')),
    change('ordensServico', 212, priced(212, '2.55', 'Unique', 'Airbnb')),
  ]);
  await commit([
    change('ordensServico', 213, {
      id: 213,
      hotel: 'Unlimited',
      apartamento: '1111',
      titulo: 'Sem fechamento',
      status: 'Aberta',
    }),
  ]);
  await assert.rejects(
    commit([change('ordensServico', 214, priced(214, '1.005'))]),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    commit([change('ordensServico', 214, priced(214, '-0.01'))]),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    commit([
      change(
        'estoqueBookSantos',
        'singleton',
        { colunas: [], itens: [{ id: 'material', quantidade: 8, valor: '1.005' }] },
        3,
      ),
    ]),
    (error) => error.code === '22023',
  );
  const finance = async (payer = null, cursor = null, limit = 50) =>
    (await db.query('select public.book_finance($1,$2,$3) result', [payer, cursor, limit])).rows[0]
      .result;
  const summary = await finance('Book Santos', null, 1);
  assert.equal(summary.groups.find((group) => group.payer === 'Book Santos').total, '9.30');
  assert.equal(summary.groups.find((group) => group.payer === 'Book Santos').finalized, '9.00');
  assert.equal(summary.groups.find((group) => group.payer === 'Book Santos').pending, '0.30');
  assert.equal(summary.records.length, 1);
  assert.equal(summary.records[0].service, '0.20');
  assert.equal(summary.next, '211');
  const secondPage = await finance('Book Santos', summary.next, 1);
  assert.equal(secondPage.records[0].id, '210');
  assert.equal(secondPage.groups.find((group) => group.payer === 'Book Santos').total, '9.30');
  const finalPage = await finance('Book Santos', secondPage.next, 1);
  assert.equal(finalPage.records[0].id, '201');
  assert.equal(finalPage.next, null);
  const history = async (start, end, payer = 'Book Santos', cursor = null) =>
    (
      await db.query('select public.book_finance_history($1,$2,1,$3,$4) result', [
        payer,
        cursor,
        start,
        end,
      ])
    ).rows[0].result;
  const day = await history('2026-10-22', '2026-10-23');
  assert.equal(day.records[0].id, '210');
  assert.equal(day.records[0].date, '2026-10-22');
  assert.equal(day.next, null);
  assert.equal(day.groups.find((group) => group.payer === 'Book Santos').total, '0.10');
  const week = await history('2026-10-19', '2026-10-26');
  assert.equal(week.groups.find((group) => group.payer === 'Book Santos').total, '0.30');
  assert.equal(week.next, '211');
  const weekSecond = await history('2026-10-19', '2026-10-26', 'Book Santos', week.next);
  assert.equal(weekSecond.records[0].id, '210');
  assert.equal(weekSecond.groups.find((group) => group.payer === 'Book Santos').total, '0.30');
  const month = await history('2026-10-01', '2026-11-01');
  assert.equal(month.groups.find((group) => group.payer === 'Book Santos').total, '9.30');
  assert.equal((await history('2027-01-01', '2028-01-01')).records.length, 0);
  await assert.rejects(history('2026-10-23', '2026-10-22'), (error) => error.code === '22023');
  const financialDate = async (doc) =>
    (
      await db.query('select public.book_finance_date($1::jsonb)::text result', [
        JSON.stringify(doc),
      ])
    ).rows[0].result;
  assert.equal(await financialDate({ abertaEm: '2026-10-23T01:30:00Z' }), '2026-10-22');
  assert.equal(
    await financialDate({ fechamento: { data: '2026-10-23' }, abertaEm: '2026-10-23T01:30:00Z' }),
    '2026-10-23',
  );
  assert.equal(await financialDate({ data: '21/10/2026, 10:30:00' }), '2026-10-21');
  assert.equal(await financialDate({ data: '31/02/2026' }), null);
  await commit([
    change(
      'estoqueBookSantos',
      'singleton',
      {
        colunas: [],
        itens: [
          { id: 'material', nome: 'Torneira', quantidade: 8, valor: '2.00' },
          { id: 'x', quantidade: 10, valor: '0.01' },
          { id: 'y', quantidade: 10, valor: '0.01' },
        ],
      },
      3,
    ),
  ]);
  await commit([
    change('ordensServico', 214, {
      ...priced(214, '0.10', 'Unlimited', 'Governança'),
      fechamento: {
        valorServico: '0.10',
        responsavelPagamento: 'Governança',
        materiais: [
          { id: 'x', quantidade: 0.5 },
          { id: 'y', quantidade: 0.5 },
        ],
      },
    }),
  ]);
  const fractional = (
    await db.query("select data->'fechamento' result from public.book_records where id='214'")
  ).rows[0].result;
  assert.equal(fractional.valorMaterial, '0.01');
  assert.equal(fractional.custoTotal, '0.11');
  await actor(admin);
  const restricted = await finance();
  assert.deepEqual(
    restricted.groups.map((group) => group.payer),
    ['Airbnb'],
  );
  assert.equal(restricted.groups[0].total, '2.55');
  assert.deepEqual(
    (await history('2026-10-22', '2026-10-23', null)).groups.map((group) => group.payer),
    ['Airbnb'],
  );
  assert.equal((await finance('Book Santos')).records.length, 0);
  await actor(master);
  assert.ok((await db.query('select * from public.book_audit')).rows.length >= 6);
  await actor(client);
  await assert.rejects(finance(), (error) => error.code === '42501');
  await assert.rejects(history('2026-10-22', '2026-10-23'), (error) => error.code === '42501');
  const message = {
    id: 'm1',
    texto: 'Olá',
    autorNome: 'Cliente',
    autorTipo: 'cliente',
    lidoAdmin: false,
    lidoCliente: true,
  };
  const conversation = { chamadoId: '101', hotel: 'Unlimited', mensagens: [message] };
  const chatId = `${client}::101`;
  await assert.rejects(
    commit([
      change('conversasSuporte', chatId, {
        ...conversation,
        mensagens: [{ ...message, autorTipo: 'admin' }],
      }),
    ]),
    (error) => error.code === '22023',
  );
  await commit([change('conversasSuporte', chatId, conversation)]);
  await assert.rejects(
    commit([
      change(
        'conversasSuporte',
        chatId,
        { ...conversation, mensagens: [{ ...message, texto: 'histórico adulterado' }] },
        1,
      ),
    ]),
    (error) => error.code === '42501',
  );
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
    'book-attachments',
    `${client}/Unlimited/file`,
  ]);
  await assert.rejects(
    db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
      'book-attachments',
      `${client}/Unique/file`,
    ]),
    (error) => error.code === '42501',
  );
  await actor(other);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  assert.equal((await db.query('select * from public.book_audit')).rows.length, 0);
  const managed = '55555555-5555-4555-8555-555555555555';
  await db.exec('reset role');
  await db.query('insert into auth.users(id,email) values($1,$2)', [managed, 'novo@test.com']);
  const manage = (target, name, role, hotels, version) =>
    db.query('select public.book_manage_user($1,$2,$3,$4,$5)', [
      target,
      name,
      role,
      hotels,
      version,
    ]);
  await actor(admin);
  await assert.rejects(
    manage(managed, 'Novo', 'adm', ['Unlimited'], 0),
    (error) => error.code === '42501',
  );
  await actor(client);
  await assert.rejects(
    manage(client, 'Promovido', 'adm', ['Unique'], 1),
    (error) => error.code === '42501',
  );
  await actor(master);
  await manage(managed, 'Novo', 'cliente', ['Unlimited'], 0);
  assert.equal(
    (await db.query('select funcao from public.book_profiles where id=$1', [managed])).rows[0]
      .funcao,
    'cliente',
  );
  assert.equal(
    (await db.query('select hotel from public.book_hotel_access where user_id=$1', [managed]))
      .rows[0].hotel,
    'Unlimited',
  );
  await assert.rejects(
    manage(managed, 'Inválido', 'adm', ['Outro'], 1),
    (error) => error.code === '22023',
  );
  await assert.rejects(
    manage(master, 'Rebaixado', 'cliente', [], 1),
    (error) => error.code === '42501',
  );
  await manage(managed, 'Funcionário', 'adm', ['Unique'], 1);
  await assert.rejects(
    manage(managed, 'Antigo', 'cliente', ['Unlimited'], 1),
    (error) => error.code === 'PT409',
  );
  assert.deepEqual(
    (
      await db.query('select hotel from public.book_hotel_access where user_id=$1', [managed])
    ).rows.map((r) => r.hotel),
    ['Unique'],
  );
  assert.equal(
    (await db.query('select * from public.book_user_audit where user_id=$1', [managed])).rows
      .length,
    2,
  );
  await actor(managed);
  assert.equal((await db.query('select * from public.book_user_audit')).rows.length, 0);
  assert.deepEqual(
    (await db.query('select distinct user_id from public.book_hotel_access')).rows.map(
      (r) => r.user_id,
    ),
    [managed],
  );
  assert.equal(
    (await db.query('select public.book_can_hotel($1) allowed', ['Unlimited'])).rows[0].allowed,
    false,
  );
  assert.equal(
    (await db.query('select public.book_can_hotel($1) allowed', ['Unique'])).rows[0].allowed,
    true,
  );
  await db.exec('reset role; set role anon');
  await assert.rejects(
    manage(managed, 'Anônimo', 'adm', ['Unlimited'], 2),
    (error) => error.code === '42501',
  );
  await assert.rejects(commit([]), (error) => error.code === '42501');
  await db.exec('reset role');
  await db.exec(migration('202610230007_catalog.sql'));
  await db.exec(migration('202610230007_catalog.sql'));
  const catalog = require('../assets/catalog');
  const apartments = (await db.query('select hotel,apartment from public.book_apartments')).rows;
  assert.equal(apartments.length, 126);
  assert.equal(new Set(apartments.map((row) => row.hotel)).size, 17);
  for (const hotel of catalog.hotels) {
    assert.deepEqual(
      apartments
        .filter((row) => row.hotel === hotel)
        .map((row) => row.apartment)
        .sort(),
      [...catalog.apartments[hotel]].sort(),
    );
  }
  await actor(master);
  await manage(managed, 'Todos', 'adm', catalog.hotels, 2);
  await actor(managed);
  await commit([
    change('chamados', 9001, {
      id: 9001,
      hotel: 'Lume Alto da Boa Vista',
      apartamento: '194A',
      assunto: 'Teste',
      descricao: 'Teste',
      status: 'Aberto',
    }),
  ]);
  await assert.rejects(
    commit([
      change('chamados', 9002, {
        id: 9002,
        hotel: 'Be Urban',
        apartamento: '194A',
        assunto: 'Teste',
        status: 'Aberto',
      }),
    ]),
    (error) => error.code === '22023',
  );
  await actor(client);
  assert.equal(
    (await db.query("select * from public.book_apartments where hotel='Be Urban'")).rows.length,
    0,
  );
  await db.exec('reset role');
  await db.exec(migration('202610230008_backup.sql'));
  await db.exec(migration('202610230008_backup.sql'));
  await db.exec(migration('202610230009_hardening.sql'));
  await db.exec(migration('202610230009_hardening.sql'));
  await db.exec('set role anon');
  assert.equal((await db.query('select public.book_schema_version() version')).rows[0].version, 9);
  await assert.rejects(
    db.query("select public.book_backup(array['chamados'])"),
    (error) => error.code === '42501',
  );
  await actor(client);
  await assert.rejects(
    db.query("select public.book_backup(array['chamados'])"),
    (error) => error.code === '42501',
  );
  await actor(managed);
  await assert.rejects(
    db.query("select public.book_backup(array['chamados'])"),
    (error) => error.code === '42501',
  );
  await actor(master);
  const exported = (
    await db.query("select public.book_backup(array['chamados','cadastros','auditoria']) result")
  ).rows[0].result;
  assert.ok(exported.records.length > 0);
  assert.ok(exported.records.every((row) => row.collection === 'chamados'));
  assert.equal(exported.apartments.length, 126);
  assert.ok(exported.profiles.length > 0);
  assert.ok(exported.audit.length > 0);
  assert.ok(exported.profiles.every((row) => !('senha' in row) && !('password' in row)));
  const historical = (
    await db.query(
      "select * from public.book_records where collection='ordensServico' and id='212'",
    )
  ).rows[0];
  await commit([
    change(
      'ordensServico',
      212,
      { ...historical.data, hotel: 'Unique Residence', descricao: 'Histórico preservado' },
      Number(historical.version),
    ),
  ]);
  const preserved = (
    await db.query(
      "select * from public.book_records where collection='ordensServico' and id='212'",
    )
  ).rows[0];
  assert.equal(preserved.hotel, 'Unique');
  assert.equal(preserved.data.hotel, 'Unique');
  assert.equal(preserved.data.descricao, 'Histórico preservado');
  await actor(managed);
  assert.equal(
    (await db.query("select public.book_can_hotel('Unique') allowed")).rows[0].allowed,
    true,
  );
  const counts = (await db.query('select public.book_counts() result')).rows[0].result;
  assert.ok(counts.chamados >= 1);
  await db.exec('reset role');
  for (const name of ['202610280010_permissions.sql', '202610280011_notes_support.sql']) {
    await db.exec(migration(name));
    await db.exec(migration(name));
  }
  await actor(master);
  assert.equal((await db.query('select public.book_schema_version() version')).rows[0].version, 11);
  const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    supportId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await actor(managed);
  await db.query('select public.book_save_note($1,$2,$3,0)', [
    noteId,
    'Minha nota',
    'Texto privado',
  ]);
  await db.query('select public.book_support_send($1,$2,$3,0)', [
    supportId,
    'Problema de acesso',
    'Preciso de ajuda',
  ]);
  assert.equal((await db.query('select * from public.book_support_messages')).rows.length, 1);
  await actor(admin);
  assert.equal((await db.query('select * from public.book_notes')).rows.length, 0);
  assert.equal((await db.query('select * from public.book_support_messages')).rows.length, 0);
  await assert.rejects(
    db.query('select public.book_support_send($1,$2,$3,1)', [supportId, '', 'Mensagem indevida']),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.query('select public.book_save_note($1,$2,$3,1)', [noteId, 'Invasão', 'Teste']),
    (e) => e.code === '42501',
  );
  await actor(master);
  assert.equal((await db.query('select * from public.book_notes')).rows.length, 0);
  assert.equal((await db.query('select * from public.book_support_messages')).rows.length, 1);
  await db.query('select public.book_support_send($1,$2,$3,1)', [supportId, '', 'Vamos resolver']);
  await db.query('select public.book_support_send($1,$2,$3,2,$4)', [supportId, '', '', 'Fechado']);
  await actor(managed);
  assert.equal((await db.query('select * from public.book_support_messages')).rows.length, 2);
  await assert.rejects(
    db.query('select public.book_support_send($1,$2,$3,3)', [
      supportId,
      '',
      'Mensagem após fechar',
    ]),
    (e) => e.code === '22023',
  );
  await assert.rejects(
    db.query('select public.book_save_note($1,$2,$3,0)', [noteId, 'Conflito', 'Texto']),
    (e) => e.code === 'PT409',
  );
  await actor(master);
  const done = (
    await db.query(
      "select * from public.book_records where collection='ordensServico' and data->>'status'='Finalizada' limit 1",
    )
  ).rows[0];
  assert.ok(done);
  const stockBefore = (
    await db.query("select data from public.book_records where collection='estoqueBookSantos'")
  ).rows[0].data;
  await db.query('select public.book_reopen_order($1,$2,$3)', [
    done.id,
    Number(done.version),
    'Corrigir informações do fechamento',
  ]);
  const reopened = (
    await db.query("select * from public.book_records where collection='ordensServico' and id=$1", [
      done.id,
    ])
  ).rows[0];
  assert.equal(reopened.data.status, 'Em andamento');
  assert.deepEqual(reopened.data.fechamento, done.data.fechamento);
  assert.deepEqual(
    (await db.query("select data from public.book_records where collection='estoqueBookSantos'"))
      .rows[0].data,
    stockBefore,
  );
  await commit([
    change(
      'ordensServico',
      reopened.id,
      { ...reopened.data, status: 'Finalizada' },
      Number(reopened.version),
    ),
  ]);
  assert.deepEqual(
    (await db.query("select data from public.book_records where collection='estoqueBookSantos'"))
      .rows[0].data,
    stockBefore,
  );
  await assert.rejects(
    db.query('select public.book_reopen_order($1,$2,$3)', [
      done.id,
      Number(done.version),
      'Conflito',
    ]),
    (e) => e.code === 'PT409',
  );
  const managedVersion = (
    await db.query('select version from public.book_profiles where id=$1', [managed])
  ).rows[0].version;
  await db.query("select public.book_manage_user($1,'Restrito','adm',$2,$3,array['vistorias'])", [
    managed,
    catalog.hotels,
    Number(managedVersion),
  ]);
  await actor(managed);
  assert.equal(
    (await db.query("select * from public.book_records where collection='estoqueBookSantos'")).rows
      .length,
    0,
  );
  await assert.rejects(db.query('select public.book_finance_history()'), (e) => e.code === '42501');
  await assert.rejects(db.query('select public.book_finance()'), (e) => e.code === '42501');
  await assert.rejects(
    db.query('select public.book_commit_v9($1::jsonb)', ['[]']),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    commit([change('chamados', 99991, ticket(99991))]),
    (e) => e.code === '42501',
  );
  await actor(client);
  await assert.rejects(
    db.query('select public.book_save_note($1,$2,$3,0)', [crypto.randomUUID(), 'Teste', 'Texto']),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  await db.exec(migration('202610280012_security.sql'));
  await db.exec(migration('202610280012_security.sql'));
  await actor(managed);
  assert.equal((await db.query('select public.book_schema_version() v')).rows[0].v, 12);
  assert.ok(
    (await db.query('select * from public.book_profiles')).rows.every((p) => p.funcao === 'adm'),
  );
  await assert.rejects(
    db.query('select public.book_ai_commit($1::jsonb,999999)', ['[]']),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    db.query('select public.book_ai_commit($1::jsonb)', [
      JSON.stringify([change('chamados', 99991, ticket(99991))]),
    ]),
    (e) => e.code === '42501',
  );
  await actor(client);
  await assert.rejects(
    db.query('select public.book_ai_commit($1::jsonb)', ['[]']),
    (e) => e.code === '42501',
  );
  const filename = master + '/Unlimited/' + crypto.randomUUID();
  await db.exec('reset role');
  await db.query("insert into storage.objects(bucket_id,name) values('book-attachments',$1)", [
    filename,
  ]);
  await actor(master);
  const stockVersion = (
    await db.query(
      "select version from public.book_records where collection='estoqueBookSantos' and id='singleton'",
    )
  ).rows[0].version;
  await db.query('select public.book_ai_commit($1::jsonb,$2)', ['[]', stockVersion]);
  await commit([
    change('vistorias', 99992, {
      ...inspection,
      id: 99992,
      apartamento: '618',
      anexos: [{ dados: '/api/files/' + filename }],
    }),
  ]);
  await actor(managed);
  assert.equal(
    (await db.query('select * from storage.objects where name=$1', [filename])).rows.length,
    1,
  );
  await db.exec('reset role');
  await db.query("update public.book_profiles set tabs=array['chamados'] where id=$1", [managed]);
  await actor(managed);
  assert.equal(
    (await db.query('select * from storage.objects where name=$1', [filename])).rows.length,
    0,
  );
  await commit([
    change('chamados', 99993, {
      ...ticket(99993),
      apartamento: '618',
      descricao: '/api/files/' + filename,
    }),
  ]);
  assert.equal(
    (await db.query('select * from storage.objects where name=$1', [filename])).rows.length,
    0,
    'A URL no texto não autoriza ler arquivo de outra aba',
  );
  await assert.rejects(
    commit([
      change('chamados', 99994, {
        ...ticket(99994),
        apartamento: '618',
        anexos: [{ dados: '/api/files/' + filename }],
      }),
    ]),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    commit([
      change('chamados', 99995, {
        ...ticket(99995),
        apartamento: '618',
        extra: 'x'.repeat(140000),
      }),
    ]),
    (e) => e.code === '23514',
  );
  await db.exec('reset role');
  await db.query("update public.book_profiles set tabs='{}' where id=$1", [managed]);
  await actor(managed);
  assert.deepEqual(
    (await db.query('select id from public.book_profiles')).rows.map((p) => p.id),
    [managed],
  );
  await assert.rejects(
    db.query("insert into storage.objects(bucket_id,name) values('book-attachments',$1)", [
      managed + '/Unlimited/' + crypto.randomUUID(),
    ]),
    (e) => e.code === '42501',
  );
  await actor(master);
  assert.equal((await db.query('select * from public.book_profiles')).rows.length, 5);
  await db.exec('reset role');
  await db.exec(migration('202610280013_collaboration.sql'));
  await db.exec(migration('202610280013_collaboration.sql'));
  await actor(master);
  assert.equal((await db.query('select public.book_schema_version() v')).rows[0].v, 13);
  const supportSummary = (await db.query('select public.book_support_summary() result')).rows[0]
    .result;
  assert.equal(supportSummary.total, 1);
  assert.equal(supportSummary.closed, 1);
  assert.equal(supportSummary.open, 0);
  let notifications = (await db.query('select public.book_notifications() result')).rows[0].result;
  assert.ok(notifications.support.count >= 1);
  await db.query('select public.book_support_read($1,now())', [supportId]);
  notifications = (await db.query('select public.book_notifications() result')).rows[0].result;
  assert.equal(notifications.support.count, 0);
  await actor(managed);
  await assert.rejects(db.query('select public.book_support_summary()'), (e) => e.code === '42501');
  await assert.rejects(
    db.query("select public.book_support_send($1,'','',3,'Inventado')", [supportId]),
    (e) => e.code === '22023',
  );
  await actor(master);
  const reminderNote = crypto.randomUUID();
  await db.query('select public.book_save_note($1,$2,$3,0)', [
    reminderNote,
    'Aviso de teste',
    'Nota',
  ]);
  await db.query("select public.book_save_reminder($1,0,now()-interval '1 minute','once',true)", [
    reminderNote,
  ]);
  assert.equal(
    (await db.query('select public.book_due_reminders() result')).rows[0].result.length,
    1,
  );
  assert.equal(
    (await db.query('select public.book_due_reminders() result')).rows[0].result.length,
    1,
    'Sem confirmação, o lembrete permanece pendente',
  );
  await db.query(
    'select public.book_ack_reminder($1,(select due_at from public.book_reminders where note_id=$1))',
    [reminderNote],
  );
  assert.equal(
    (await db.query('select public.book_due_reminders() result')).rows[0].result.length,
    0,
  );
  await db.query("select public.book_save_reminder($1,2,now()-interval '1 minute','daily',true)", [
    reminderNote,
  ]);
  assert.equal(
    (await db.query('select public.book_due_reminders() result')).rows[0].result.length,
    1,
  );
  await db.query(
    'select public.book_ack_reminder($1,(select due_at from public.book_reminders where note_id=$1))',
    [reminderNote],
  );
  const nextReminder = (
    await db.query('select * from public.book_reminders where note_id=$1', [reminderNote])
  ).rows[0];
  assert.equal(nextReminder.enabled, true);
  assert.ok(new Date(nextReminder.due_at) > new Date());
  await actor(managed);
  assert.equal((await db.query('select * from public.book_reminders')).rows.length, 0);
  await assert.rejects(
    db.query("select public.book_save_reminder($1,4,now(),'daily',true)", [reminderNote]),
    (e) => e.code === '42501',
  );
  const feedbackId = crypto.randomUUID();
  const feedbackDoc = {
    assunto: 'Avaliação do hóspede',
    hotel: 'Unlimited',
    apartamento: '618',
    grau: 'Crítico',
    observacoes: 'Verificar torneira',
    anexos: [{ nome: 'foto.png', dados: '/api/files/' + filename }],
  };
  await assert.rejects(
    db.query('select public.book_save_feedback($1,0,$2)', [feedbackId, feedbackDoc]),
    (e) => e.code === '42501',
  );
  await actor(master);
  await db.query('select public.book_save_feedback($1,0,$2)', [feedbackId, feedbackDoc]);
  await assert.rejects(
    db.query('select public.book_save_feedback($1,0,$2)', [feedbackId, feedbackDoc]),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    db.query('select public.book_save_feedback($1,1,$2)', [
      feedbackId,
      { ...feedbackDoc, apartamento: 'NAO-EXISTE' },
    ]),
    (e) => e.code === '22023',
  );
  assert.equal(
    (await db.query("select public.book_feedback_service($1,1,'99998') id", [feedbackId])).rows[0]
      .id,
    '99998',
  );
  assert.equal(
    (await db.query("select public.book_feedback_service($1,1,'99999') id", [feedbackId])).rows[0]
      .id,
    '99998',
  );
  const service = (
    await db.query(
      "select data from public.book_records where collection='ordensServico' and id='99998'",
    )
  ).rows[0].data;
  assert.equal(service.feedbackId, feedbackId);
  assert.equal(service.prioridade, 'Urgente');
  assert.deepEqual(service.anexos, feedbackDoc.anexos);
  const teamId = crypto.randomUUID();
  await db.query('select public.book_team_send($1,$2,$3)', [
    teamId,
    'Bom trabalho na vistoria',
    admin,
  ]);
  await db.query('select public.book_team_send($1,$2,$3)', [
    teamId,
    'Bom trabalho na vistoria',
    admin,
  ]);
  assert.equal((await db.query('select * from public.book_team_messages')).rows.length, 1);
  const fullBackup = (
    await db.query("select public.book_backup(array['colaboracao','anexos']) result")
  ).rows[0].result;
  assert.equal(fullBackup.feedbacks.length, 1);
  assert.equal(fullBackup.evaluations.length, 1);
  assert.equal(fullBackup.support.length, 1);
  assert.ok(fullBackup.notes.every((n) => n.owner_id === master));
  await actor(admin);
  assert.equal((await db.query('select * from public.book_team_messages')).rows.length, 1);
  assert.equal((await db.query('select * from public.book_feedbacks')).rows.length, 0);
  await actor(managed);
  assert.equal((await db.query('select * from public.book_team_messages')).rows.length, 0);
  await actor(client);
  assert.equal((await db.query('select * from public.book_feedbacks')).rows.length, 0);
  await assert.rejects(
    db.query('select public.book_team_send($1,$2)', [crypto.randomUUID(), 'Não autorizado']),
    (e) => e.code === '42501',
  );
  await assert.rejects(db.query('select public.book_due_reminders()'), (e) => e.code === '42501');
  await assert.rejects(
    db.query(
      "insert into public.book_feedbacks(id,owner_id,hotel,data) values($1,$2,'Unlimited','{}')",
      [crypto.randomUUID(), client],
    ),
    (e) => e.code === '42501',
  );
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.book_due_reminders()'), (e) => e.code === '42501');
  await assert.rejects(db.query('select public.book_notifications()'), (e) => e.code === '42501');
  await db.exec('reset role');
  await db.exec(migration('202610280014_routine.sql'));
  await db.exec(migration('202610280014_routine.sql'));
  await actor(master);
  assert.equal((await db.query('select public.book_schema_version() v')).rows[0].v, 14);
  const routineBase = {
    titulo: 'Teste de rotina',
    observacoes: 'Informações do teste',
    prioridade: 'Normal',
    responsavel: null,
    prazo: '2026-11-10',
    anexos: [],
    checks: {},
  };
  const routineSave = (id, kind, phase, document, version = 0, site = 'Unlimited', unit = '618') =>
    db.query('select public.book_process_save($1,$2,$3,$4,$5,$6,$7)', [
      id,
      kind,
      version,
      site,
      unit,
      phase,
      document,
    ]);
  const routineReservation = crypto.randomUUID();
  const reservationDocument = {
    ...routineBase,
    cliente: 'Hóspede de teste',
    canal: 'Direta',
    codigo: 'TESTE-01',
    checkin: '2026-11-10',
    checkout: '2026-11-12',
    hospedes: '2',
  };
  await routineSave(routineReservation, 'reservas', 'Novas reservas', reservationDocument);
  await assert.rejects(
    routineSave(crypto.randomUUID(), 'reservas', 'Novas reservas', {
      ...reservationDocument,
      codigo: 'TESTE-02',
    }),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    routineSave(routineReservation, 'reservas', 'Autorizada', reservationDocument, 1),
    (e) => e.code === '22023',
  );
  await routineSave(
    routineReservation,
    'reservas',
    'Autorizada',
    { ...reservationDocument, checks: { 'Documentos conferidos': true } },
    1,
  );
  await routineSave(crypto.randomUUID(), 'reservas', 'Novas reservas', {
    ...reservationDocument,
    codigo: 'TESTE-03',
    checkin: '2026-11-12',
    checkout: '2026-11-13',
  });
  const routineProject = crypto.randomUUID(),
    routineOnboarding = crypto.randomUUID(),
    routineDamage = crypto.randomUUID(),
    routinePurchase = crypto.randomUUID(),
    routinePlan = crypto.randomUUID();
  await routineSave(
    routineProject,
    'projetos',
    'Planejamento',
    { ...routineBase, categoria: 'Operação', custoPrevisto: '10.50' },
    0,
    null,
    null,
  );
  await routineSave(routineOnboarding, 'onboarding', 'Boas-vindas', {
    ...routineBase,
    cliente: 'Proprietário de teste',
  });
  await routineSave(routineDamage, 'danos', 'Comunicação', {
    ...routineBase,
    item: 'Taça',
    quantidade: '1',
    origem: 'Vistoria',
  });
  await routineSave(routinePurchase, 'compras', 'Comprada', {
    ...routineBase,
    itens: 'Parafusos',
    quantidade: '2',
  });
  await routineSave(
    routinePlan,
    'desempenho',
    'Avaliação',
    { ...routineBase, funcionario: admin, inicio: '2026-10-01', fim: '2026-10-28' },
    0,
    null,
    null,
  );
  const routinePage = (await db.query("select public.book_process_page('reservas',0,'{}') result"))
    .rows[0].result;
  assert.equal(routinePage.total, 2);
  assert.equal(routinePage.counts.Autorizada, 1);
  await db.query('select public.book_flow_comment($1,$2,$3)', [
    'process',
    routineProject,
    'Acompanhamento do projeto',
  ]);
  const routineHistory = (
    await db.query('select public.book_flow_details($1,$2) result', ['process', routineProject])
  ).rows[0].result;
  assert.equal(routineHistory.events[0].actor_id, master);
  assert.equal(routineHistory.events[0].body, 'Acompanhamento do projeto');
  await assert.rejects(
    routineSave(
      routineProject,
      'projetos',
      'Planejamento',
      { ...routineBase, categoria: 'Operação' },
      0,
      null,
      null,
    ),
    (e) => e.code === 'PT409',
  );
  const routineStock = (
    await db.query(
      "select * from public.book_records where collection='estoqueBookSantos' and id='singleton'",
    )
  ).rows[0];
  const routineMaterial = routineStock.data.itens[0];
  await db.query('select public.book_purchase_receive($1,1,$2,$3,2)', [
    routinePurchase,
    routineStock.version,
    routineMaterial.id,
  ]);
  await db.query('select public.book_purchase_receive($1,1,$2,$3,2)', [
    routinePurchase,
    routineStock.version,
    routineMaterial.id,
  ]);
  const routineStockAfter = (
    await db.query(
      "select data from public.book_records where collection='estoqueBookSantos' and id='singleton'",
    )
  ).rows[0].data;
  assert.equal(routineStockAfter.itens[0].quantidade, Number(routineMaterial.quantidade) + 2);
  assert.equal(
    (
      await db.query("select public.book_process_service('process',$1,1,'88881') id", [
        routineDamage,
      ])
    ).rows[0].id,
    '88881',
  );
  assert.equal(
    (
      await db.query("select public.book_process_service('process',$1,1,'88882') id", [
        routineDamage,
      ])
    ).rows[0].id,
    '88881',
  );
  assert.equal(
    (await db.query("select public.book_process_service('vistorias','99992',1,'88883') id")).rows[0]
      .id,
    '88883',
  );
  assert.equal(
    (await db.query("select public.book_process_service('vistorias','99992',1,'88884') id")).rows[0]
      .id,
    '88883',
  );
  const routineService = (
    await db.query(
      "select * from public.book_records where collection='ordensServico' and id='88881'",
    )
  ).rows[0];
  await db.query(
    "select public.book_flow_save('ordensServico','88881',0,$1,'Aguardando proprietário',$2)",
    [routineService.version, { origem: 'Vistoria', proprietarioAvisado: true }],
  );
  await db.query("select public.book_flow_save('ordensServico','88881',1,$1,'Em andamento',$2)", [
    routineService.version,
    { origem: 'Vistoria', responsavel: master, prazo: '2026-11-10' },
  ]);
  assert.equal(
    (
      await db.query(
        "select data->>'status' status from public.book_records where id='88881' and collection='ordensServico'",
      )
    ).rows[0].status,
    'Em andamento',
  );
  assert.equal(
    (
      await db.query(
        "select data->>'responsavelLogin' assigned from public.book_records where id='88881' and collection='ordensServico'",
      )
    ).rows[0].assigned,
    'Mestre@test.com',
  );
  await assert.rejects(
    db.query("select public.book_flow_save('ordensServico','88881',2,2,'Resolvido','{}')"),
    (e) => e.code === '22023',
  );
  const routineServices = (
    await db.query('select public.book_service_page(0,\'{"phase":"Em andamento"}\') result')
  ).rows[0].result;
  assert.ok(routineServices.rows.some((r) => r.id === '88881'));
  const routineFeedback = (
    await db.query('select * from public.book_feedbacks where id=$1', [feedbackId])
  ).rows[0];
  await db.query("select public.book_flow_save('feedbacks',$1,0,$2,'Concluído',$3)", [
    feedbackId,
    routineFeedback.version,
    { respostaCliente: 'Problema resolvido e comunicado', resolvidoPor: master },
  ]);
  const routineBackup = (await db.query("select public.book_backup(array['colaboracao']) result"))
    .rows[0].result;
  assert.equal(routineBackup.processes.length, 7);
  assert.ok(routineBackup.flow_events.length > 0);
  assert.equal(routineBackup.inspection_services.length, 1);
  await actor(managed);
  assert.equal((await db.query('select * from public.book_processes')).rows.length, 0);
  await assert.rejects(
    db.query("select public.book_process_page('reservas')"),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.query('select public.book_flow_details($1,$2)', ['process', routineReservation]),
    (e) => e.code === '42501',
  );
  await actor(master);
  assert.equal(
    (await db.query("select public.book_routine_date('2026-02-30') value")).rows[0].value,
    null,
  );
  await routineSave(
    routineOnboarding,
    'onboarding',
    'Checagem',
    {
      ...routineBase,
      cliente: 'Proprietário de teste',
      anexos: [{ nome: 'foto.png', dados: '/api/files/' + filename }],
    },
    1,
  );
  await db.exec('reset role');
  await db.query("update public.book_profiles set tabs=array['onboarding'] where id=$1", [managed]);
  await actor(managed);
  assert.equal(
    (await db.query('select * from storage.objects where name=$1', [filename])).rows.length,
    1,
    'Anexo do onboarding só é disponibilizado mediante acesso ao processo',
  );
  await actor(admin);
  assert.equal(
    (await db.query('select * from storage.objects where name=$1', [filename])).rows.length,
    0,
    'Administrador de outro condomínio não recebe o arquivo',
  );
  await actor(client);
  await assert.rejects(
    routineSave(crypto.randomUUID(), 'danos', 'Comunicação', {
      ...routineBase,
      item: 'Taça',
      quantidade: '1',
      origem: 'Vistoria',
    }),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  await db.exec(migration('202610290015_decision.sql'));
  await db.exec(migration('202610290015_decision.sql'));
  await actor(master);
  const decision = async (site) =>
    (await db.query('select public.book_decision_snapshot($1) value', [site])).rows[0].value;
  const decisionBefore = await decision('Be Urban');
  await db.exec('reset role');
  await db.query(
    `insert into public.book_records(collection,id,owner_id,hotel,data)
   select 'ordensServico',n::text,$1::uuid,'Be Urban',jsonb_build_object('id',n::text,'hotel','Be Urban','apartamento','214','titulo','Fila SAD de teste','status','Aberta','prioridade',case when n=990000 then 'Urgente' else 'Normal' end,'vencimento',((now() at time zone 'America/Sao_Paulo')::date-1)::text)
   from generate_series(990000,990129) n`,
    [master],
  );
  await db.query(
    `insert into public.book_records(collection,id,owner_id,hotel,data)
   select 'vistorias',(991001+n)::text,$1::uuid,'Be Urban',$2::jsonb||jsonb_build_object('id',(991001+n)::text,'hotel','Be Urban','apartamento','1410','data',((now() at time zone 'America/Sao_Paulo')::date+case when n=0 then -100 else 100 end)::text)
   from generate_series(0,1) n`,
    [master, JSON.stringify(inspection)],
  );
  assert.equal(
    (await db.query("select public.book_routine_date('2026-02-31') value")).rows[0].value,
    null,
  );
  await actor(master);
  const ds = await decision('Be Urban');
  assert.equal(
    ds.services.open,
    decisionBefore.services.open + 130,
    'SAD agrega além da primeira página',
  );
  assert.equal(ds.services.overdue, decisionBefore.services.overdue + 130);
  assert.equal(
    ds.byHotel.reduce((n, r) => n + r.open, 0),
    ds.services.open,
  );
  assert.equal(
    ds.byAssignee.reduce((n, r) => n + r.open, 0),
    ds.services.open,
  );
  assert.ok(ds.queue.length <= 12 && ds.queue.every((r) => r.hotel === 'Be Urban'));
  assert.ok(ds.queue.every((r, i) => !i || r.rank >= ds.queue[i - 1].rank));
  assert.equal(ds.inspections.units, 6);
  assert.ok(ds.inspections.overdue >= 1);
  assert.ok(
    ds.inspections.items.some((r) => r.apartment === '1410' && r.next_due < ds.referenceDate),
    'Ignora vistoria futura e data inválida',
  );
  const dsStock = (
    await db.query(
      "select data,version from public.book_records where collection='estoqueBookSantos' and id='singleton'",
    )
  ).rows[0];
  const dsMaterial = dsStock.data.itens[0];
  dsMaterial.minimo = Number(dsMaterial.quantidade) + 1;
  await commit([change('estoqueBookSantos', 'singleton', dsStock.data, Number(dsStock.version))]);
  assert.ok(
    (await decision(null)).stock.items.some(
      (r) => r.id === dsMaterial.id && Number(r.minimum) === dsMaterial.minimo,
    ),
  );
  const dsVersion = (
    await db.query(
      "select version from public.book_records where collection='estoqueBookSantos' and id='singleton'",
    )
  ).rows[0].version;
  dsMaterial.minimo = -1;
  await assert.rejects(
    commit([change('estoqueBookSantos', 'singleton', dsStock.data, Number(dsVersion))]),
    (e) => e.code === '22023',
  );
  dsMaterial.minimo = '2';
  await assert.rejects(
    commit([change('estoqueBookSantos', 'singleton', dsStock.data, Number(dsVersion))]),
    (e) => e.code === '22023',
  );
  await db.exec('reset role');
  await db.query("update public.book_profiles set tabs=array['dashboard'] where id=$1", [admin]);
  await db.query('delete from public.book_hotel_access where user_id=$1', [admin]);
  await db.query("insert into public.book_hotel_access(user_id,hotel) values($1,'Unlimited')", [
    admin,
  ]);
  await actor(admin);
  const scoped = await decision(null);
  assert.ok(scoped.byHotel.every((r) => r.hotel === 'Unlimited'));
  assert.equal(scoped.permissions.stock, false);
  assert.equal(scoped.permissions.inspections, false);
  assert.equal(scoped.stock.items.length, 0);
  assert.equal(scoped.inspections.units, 0);
  await assert.rejects(decision('Be Urban'), (e) => e.code === '42501');
  await actor(managed);
  await assert.rejects(decision(null), (e) => e.code === '42501');
  await actor(client);
  await assert.rejects(decision(null), (e) => e.code === '42501');
  await db.exec('reset role');
  await db.exec(migration('202610290016_onboarding_catalog.sql'));
  await db.exec(migration('202610290016_onboarding_catalog.sql'));
  const addCatalog = (kind, hotel, units) =>
    db.query('select public.book_catalog_add($1,$2,$3) value', [kind, hotel, units]);
  await actor(client);
  await assert.rejects(
    addCatalog('condominium', 'Prédio Novo', ['101']),
    (e) => e.code === '42501',
  );
  await actor(admin);
  await assert.rejects(
    addCatalog('condominium', 'Prédio Novo', ['101']),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  await db.query(
    "update public.book_profiles set tabs=array['onboarding','condominios','os','feedbacks','vistorias','reservas'] where id=$1",
    [admin],
  );
  await actor(admin);
  assert.equal(
    (await addCatalog('condominium', 'Prédio Novo', ['101', '194a'])).rows[0].value.created,
    2,
  );
  assert.ok(
    (await db.query('select name from public.book_condominiums')).rows.some(
      (r) => r.name === 'Prédio Novo',
    ),
  );
  await assert.rejects(
    addCatalog('condominium', 'prédio novo', ['102']),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(addCatalog('apartments', 'Be Urban', ['999']), (e) => e.code === '42501');
  await assert.rejects(
    addCatalog('apartments', 'Prédio Novo', ['102', '101']),
    (e) => e.code === 'PT409',
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_apartments where hotel='Prédio Novo' and apartment='102'",
      )
    ).rows[0].n,
    0,
    'O lote inteiro é revertido se houver duplicata',
  );
  await addCatalog('apartments', 'Prédio Novo', ['102']);
  await assert.rejects(addCatalog('apartments', 'Prédio Novo', [null]), (e) => e.code === '22023');
  await assert.rejects(addCatalog('condominium', '<script>', ['1']), (e) => e.code === '22023');
  await assert.rejects(
    db.exec("insert into public.book_apartments values('Prédio Novo','200')"),
    (e) => e.code === '42501',
  );
  const newFilename = admin + '/Prédio Novo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query("insert into storage.objects(bucket_id,name) values('book-attachments',$1)", [
    newFilename,
  ]);
  const newService = {
    id: '999001',
    hotel: 'Prédio Novo',
    apartamento: '194A',
    titulo: 'Serviço do novo imóvel',
    status: 'Aberta',
    anexoData: '/api/files/' + newFilename,
  };
  await commit([change('ordensServico', '999001', newService)]);
  await actor(client);
  assert.equal(
    (await db.query("select * from public.book_apartments where hotel='Prédio Novo'")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.book_records where id='999001'")).rows.length,
    0,
  );
  await actor(master);
  await addCatalog('condominium', 'Prédio Sem Unidades', []);
  await db.query(
    "select public.book_manage_user($1,'Cliente atualizado','cliente',array['Prédio Novo'],$2,array[]::text[])",
    [
      client,
      Number(
        (await db.query('select version from public.book_profiles where id=$1', [client])).rows[0]
          .version,
      ),
    ],
  );
  const catalogBackup = (await db.query("select public.book_backup(array['cadastros']) value"))
    .rows[0].value;
  assert.ok(catalogBackup.condominiums.some((c) => c.name === 'Prédio Sem Unidades'));
  assert.ok(catalogBackup.catalog_audit.some((a) => a.hotel === 'Prédio Novo'));
  await actor(client);
  assert.equal(
    (await db.query("select * from public.book_apartments where hotel='Prédio Novo'")).rows.length,
    3,
  );
  await db.exec('reset role');
  await db.exec(
    "insert into public.book_flow_meta(source,record_id,phase,data) values('ordensServico','999001','Aguardando proprietário','{}')",
  );
  const preservedProcesses = (await db.query('select count(*) n from public.book_processes'))
    .rows[0].n;
  await db.exec(migration('202610290017_simplify.sql'));
  await db.exec(migration('202610290017_simplify.sql'));
  await actor(master);
  for (const tab of ['reservas', 'projetos', 'compras'])
    assert.equal(
      (await db.query('select public.book_can_tab($1) value', [tab])).rows[0].value,
      false,
    );
  const stages = new Set(['Novo', 'Em andamento', 'Recusa proprietário', 'Resolvido']);
  const simplified = (
    await db.query(
      'select public.book_service_page(0,\'{"hotel":"Prédio Novo","phase":"Em andamento"}\') value',
    )
  ).rows[0].value;
  assert.equal(simplified.total, 1);
  assert.equal(simplified.counts['Em andamento'], 1);
  assert.equal(simplified.rows[0].id, '999001');
  assert.equal(
    (
      await db.query(
        "select phase from public.book_flow_meta where record_id='999001' and source='ordensServico'",
      )
    ).rows[0].phase,
    'Aguardando proprietário',
    'O histórico não é reescrito',
  );
  const allStages = (await db.query("select public.book_service_page(0,'{}') value")).rows[0].value;
  assert.ok(Object.keys(allStages.counts).every((stage) => stages.has(stage)));
  assert.ok((await decision(null)).byPhase.every((row) => stages.has(row.phase)));
  await assert.rejects(
    db.query(
      "select public.book_flow_save('ordensServico','999001',1,1,'Aguardando proprietário','{}')",
    ),
    (e) => e.code === '22023',
  );
  await assert.rejects(
    db.query("select public.book_flow_save('ordensServico','999001',1,1,'Resolvido','{}')"),
    (e) => e.code === '22023',
  );
  await assert.rejects(
    db.query(
      "select public.book_flow_save('ordensServico','999001',1,1,'Recusa proprietário','{}')",
    ),
    (e) => e.code === '22023',
  );
  await db.query(
    "select public.book_flow_save('ordensServico','999001',1,1,'Recusa proprietário','{\"motivo\":\"Solicitação recusada pelo proprietário\"}')",
  );
  assert.equal(
    (
      await db.query(
        'select public.book_service_page(0,\'{"hotel":"Prédio Novo","phase":"Recusa proprietário"}\') value',
      )
    ).rows[0].value.total,
    1,
  );
  await addCatalog('apartments', 'Prédio Novo', ['103']);
  await assert.rejects(
    routineSave(crypto.randomUUID(), 'onboarding', 'Boas-vindas', {
      ...routineBase,
      cliente: 'Teste',
    }),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  assert.equal(
    (await db.query('select count(*) n from public.book_processes')).rows[0].n,
    preservedProcesses,
  );
  await db.exec(migration('202610290018_card_states.sql'));
  await db.exec(migration('202610290018_card_states.sql'));
  await actor(master);
  const cardRow = async () =>
    (
      await db.query(
        "select * from public.book_records where collection='ordensServico' and id='999001'",
      )
    ).rows[0];
  let unified = await cardRow();
  assert.equal(unified.data.status, 'Recusada');
  assert.match(unified.data.motivoRecusa, /recusada pelo proprietário/);
  assert.equal(unified.data.anexoData, '/api/files/' + newFilename);
  assert.equal(
    (await db.query("select tgenabled from pg_trigger where tgname='book_file_scope'")).rows[0]
      .tgenabled,
    'O',
    'A proteção de anexos é reativada após a migração',
  );
  await assert.rejects(
    commit([
      change(
        'ordensServico',
        '999001',
        { ...unified.data, status: 'Recusada', motivoRecusa: '' },
        Number(unified.version),
      ),
    ]),
    (e) => e.code === '22023',
  );
  await assert.rejects(
    commit([
      change(
        'ordensServico',
        '999001',
        {
          ...unified.data,
          anexoData: '/api/files/' + client + '/Be Urban/ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
        Number(unified.version),
      ),
    ]),
    (e) => e.code === '42501',
  );
  await commit([
    change(
      'ordensServico',
      '999001',
      { ...unified.data, status: 'Em andamento' },
      Number(unified.version),
    ),
  ]);
  assert.equal(
    (
      await db.query(
        "select phase from public.book_flow_meta where source='ordensServico' and record_id='999001'",
      )
    ).rows[0].phase,
    'Em andamento',
  );
  unified = await cardRow();
  await assert.rejects(
    commit([
      change(
        'ordensServico',
        '999001',
        { ...unified.data, status: 'Finalizada' },
        Number(unified.version),
      ),
    ]),
    (e) => e.code === '22023',
  );
  await commit([
    change(
      'ordensServico',
      '999001',
      { ...unified.data, status: 'Recusada', motivoRecusa: 'Serviço recusado pelo responsável' },
      Number(unified.version),
    ),
  ]);
  assert.equal(
    (
      await db.query(
        'select public.book_service_page(0,\'{"hotel":"Prédio Novo","phase":"Recusa proprietário"}\') value',
      )
    ).rows[0].value.total,
    1,
  );
  unified = await cardRow();
  await commit([
    change(
      'ordensServico',
      '999001',
      { ...unified.data, status: 'Aberta' },
      Number(unified.version),
    ),
  ]);
  assert.equal(
    (
      await db.query(
        "select phase from public.book_flow_meta where source='ordensServico' and record_id='999001'",
      )
    ).rows[0].phase,
    'Novo',
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_records where collection='ordensServico' and id='999001'",
      )
    ).rows[0].n,
    1,
  );
  unified = await cardRow();
  const flowVersion = (
    await db.query(
      "select version from public.book_flow_meta where source='ordensServico' and record_id='999001'",
    )
  ).rows[0].version;
  await db.query(
    "select public.book_flow_save('ordensServico','999001',$1,$2,'Recusa proprietário','{\"motivo\":\"Recusa informada no histórico\"}')",
    [Number(flowVersion), Number(unified.version)],
  );
  assert.equal(
    (await cardRow()).data.status,
    'Recusada',
    'A API antiga de acompanhamento também usa o status do mesmo card',
  );
  const closed = (
    await db.query(
      "select id,version from public.book_records where collection='ordensServico' and data->>'status'='Finalizada' limit 1",
    )
  ).rows[0];
  await db.query('select public.book_reopen_order($1,$2,$3)', [
    closed.id,
    Number(closed.version),
    'Correção solicitada no teste',
  ]);
  assert.equal(
    (
      await db.query(
        "select phase from public.book_flow_meta where source='ordensServico' and record_id=$1",
        [closed.id],
      )
    ).rows[0].phase,
    'Em andamento',
  );
  await db.exec('reset role');
  await db.exec(migration('202610300019_activity.sql'));
  await db.exec(migration('202610300019_activity.sql'));
  await actor(master);
  const today = (
    await db.query("select (now() at time zone 'America/Sao_Paulo')::date::text as event_day")
  ).rows[0].event_day;
  const scheduleData = {
    id: '991001',
    hotel: 'Unlimited',
    apartamento: '618',
    titulo: 'Histórico do prazo',
    descricao: 'Teste de acompanhamento',
    prioridade: 'Urgente',
    vencimento: '2020-01-01',
    status: 'Aberta',
    anexos: [],
  };
  await commit([change('ordensServico', '991001', scheduleData)]);
  const activityFilters = {
    start: today,
    end: today,
    group: 'day',
    hotel: 'Unlimited',
    urgency: 'Urgente',
    assignees: [],
  };
  const activity = async (filters) =>
    (
      await db.query('select public.book_activity_snapshot($1) value', [
        JSON.stringify(filters || activityFilters),
      ])
    ).rows[0].value;
  let analysis = await activity();
  assert.ok(analysis.items.some((i) => i.kind === 'created' && i.id === '991001'));
  assert.ok(analysis.items.some((i) => i.kind === 'overdue' && i.id === '991001'));
  await db.query("select public.book_card_schedule('991001',1,'2099-01-01','')");
  analysis = await activity();
  assert.ok(
    analysis.items.some((i) => i.kind === 'rescheduledWithoutComment' && i.id === '991001'),
  );
  assert.ok(analysis.items.some((i) => i.kind === 'postponed' && i.id === '991001'));
  await assert.rejects(
    db.query("select public.book_card_schedule('991001',1,'2099-02-01','Conflito')"),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    db.query("select public.book_card_schedule('991001',2,'2099-02-01',$1)", ['x'.repeat(2001)]),
    (e) => e.code === '22023',
  );
  await db.query(
    "select public.book_card_schedule('991001',2,'2099-02-01','Aguardando acesso ao apartamento')",
  );
  analysis = await activity();
  assert.ok(analysis.items.some((i) => i.kind === 'comments' && i.id === '991001'));
  assert.ok(
    !analysis.items.some((i) => i.kind === 'rescheduledWithoutComment' && i.id === '991001'),
  );
  const cardHistory = (
    await db.query("select public.book_flow_details('ordensServico','991001',null) value")
  ).rows[0].value;
  assert.equal(cardHistory.record.data.vencimento, '2099-02-01');
  assert.equal(Number(cardHistory.recordVersion), 3);
  assert.equal(
    cardHistory.events.filter((e) => e.body === 'Aguardando acesso ao apartamento').length,
    1,
  );
  assert.ok(
    !(await activity({ ...activityFilters, start: '2000-01-01', end: '2000-01-02' })).items.some(
      (i) => i.id === '991001',
    ),
  );
  await actor(client);
  await assert.rejects(activity(), (e) => e.code === '42501');
  await actor(admin);
  await assert.rejects(activity(), (e) => e.code === '42501');
  await actor(client);
  await assert.rejects(
    db.query("select public.book_card_schedule('991001',3,'2099-03-01','Sem acesso')"),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  await db.query("update public.book_profiles set tabs=array['dashboard'] where id=$1", [admin]);
  await db.query('delete from public.book_hotel_access where user_id=$1', [admin]);
  await actor(admin);
  await assert.rejects(activity(), (e) => e.code === '42501');
  assert.equal(
    (await activity({ ...activityFilters, hotel: '' })).items.length,
    0,
    'Indicadores não revelam dados de condomínios sem acesso',
  );
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  const { prepare } = require('../scripts/prepare-history-import');
  const source = {
    sha256: 'a'.repeat(64),
    sourceFile: 'teste.xlsx',
    rows: [
      {
        sourceRow: 2,
        title: "Card histórico 'teste'",
        phase: 'Resolvido',
        creator: 'Criador original',
        createdLocal: '2024-06-15T10:20:00',
        createdOriginal: '45458.4',
      },
      {
        sourceRow: 3,
        title: 'Card recusado',
        phase: 'Recusa Proprietário',
        creator: 'Equipe',
        createdLocal: '2024-06-16T10:20:00',
        createdOriginal: '45459.4',
      },
      {
        sourceRow: 4,
        title: '1001 UQ - Card novo',
        phase: 'Novo',
        creator: 'Equipe',
        createdLocal: '2024-06-17T10:20:00',
        createdOriginal: '45460.4',
      },
    ],
  };
  await db.query("update public.book_profiles set tabs=array['dashboard','os'] where id=$1", [
    admin,
  ]);
  await db.exec(migration('202611020020_read_performance.sql'));
  await db.exec(migration('202611020020_read_performance.sql'));
  const importedPlan = prepare(source),
    beforeImport = (
      await db.query("select count(*) n from public.book_records where collection='ordensServico'")
    ).rows[0].n;
  const otherCollections = (
    await db.query("select count(*) n from public.book_records where collection<>'ordensServico'")
  ).rows[0].n;
  await db.exec(importedPlan.stagingSetup);
  for (const staged of importedPlan.stagingRows.slice(0, 2))
    await db.query('insert into public.book_history_import_stage values($1,$2,$3)', [
      staged.source_hash,
      staged.source_line,
      JSON.stringify(staged.payload),
    ]);
  await assert.rejects(db.exec(importedPlan.stagedSQL), /Dados de importação inválidos/);
  await db.exec('rollback');
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection='ordensServico'"))
      .rows[0].n,
    beforeImport,
    'CSV incompleto não pode substituir cards',
  );
  const staged = importedPlan.stagingRows[2];
  await db.query('insert into public.book_history_import_stage values($1,$2,$3)', [
    staged.source_hash,
    staged.source_line,
    JSON.stringify(staged.payload),
  ]);
  await db.exec(importedPlan.stagedSQL);
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection='ordensServico'"))
      .rows[0].n,
    3,
  );
  assert.equal(
    (
      await db.query(
        "select jsonb_array_length(payload->'records') n from public.book_history_import_backups",
      )
    ).rows[0].n,
    beforeImport,
  );
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection<>'ordensServico'"))
      .rows[0].n,
    otherCollections,
  );
  await actor(master);
  assert.equal(
    (
      await db.query(
        "select data->>'titulo' title from public.book_records where id='8000000000000002'",
      )
    ).rows[0].title,
    "Card histórico 'teste'",
  );
  await assert.rejects(
    db.exec(
      'update public.book_records set data=data||\'{"status":"Em andamento"}\' where id=\'8000000000000002\'',
    ),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.query(
      "select public.book_reopen_order('8000000000000002',1,'Teste de proteção do histórico')",
    ),
    (e) => e.code === '42501',
  );
  assert.equal(
    (await db.query("select public.book_service_page(0,'{}') value")).rows[0].value.total,
    3,
  );
  assert.equal((await decision()).services.total, 3);
  await db.exec('reset role');
  await db.exec(migration('202611030021_labels.sql'));
  await db.exec(migration('202611030021_labels.sql'));
  await actor(master);
  const labelCatalog = (
    await db.query("select public.book_labels_catalog('Revisar','orange') value")
  ).rows[0].value;
  const labelId = labelCatalog[0].id,
    historyId = '8000000000000002';
  const beforeLabels = (
    await db.query(
      "select data,version from public.book_records where collection='ordensServico' and id=$1",
      [historyId],
    )
  ).rows[0];
  await assert.rejects(
    db.query("select public.book_labels_catalog('revisar','blue')"),
    (e) => e.code === '23505',
  );
  await assert.rejects(
    db.query("select public.book_labels_catalog('Invalid','red')"),
    (e) => e.code === '22023',
  );
  const assigned = (
    await db.query('select public.book_labels_assign($1,0,$2::uuid[]) value', [
      historyId,
      [labelId],
    ])
  ).rows[0].value;
  assert.equal(assigned.version, 1);
  assert.deepEqual(assigned.labelIds, [labelId]);
  const labelsBackup = (await db.query("select public.book_backup(array['ordensServico']) value"))
    .rows[0].value;
  assert.equal(labelsBackup.labels.length, 1);
  assert.equal(labelsBackup.card_labels[0].record_id, historyId);
  await assert.rejects(
    db.query('select public.book_labels_assign($1,0,$2::uuid[])', [historyId, []]),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    db.query('select public.book_labels_assign($1,1,$2::uuid[])', [
      historyId,
      ['99999999-9999-4999-8999-999999999999'],
    ]),
    (e) => e.code === '22023',
  );
  assert.deepEqual(
    (
      await db.query(
        "select data,version from public.book_records where collection='ordensServico' and id=$1",
        [historyId],
      )
    ).rows[0],
    beforeLabels,
    'Tagging preserves imported data and version',
  );
  const filteredLabels = (
    await db.query('select public.book_service_page(0,$1::jsonb) value', [
      JSON.stringify({ label: labelId }),
    ])
  ).rows[0].value;
  await db.exec('reset role');
  await db.exec(migration('202611050023_urgency_filter.sql'));
  await db.exec(migration('202611050023_urgency_filter.sql'));
  await actor(master);
  for (const urgency of ['Normal', 'Alta', 'Urgente'])
    assert.equal(
      (
        await db.query('select public.book_service_page(0,$1::jsonb) value', [
          JSON.stringify({ urgency }),
        ])
      ).rows[0].value.total,
      0,
    );
  const unknownUrgency = (
    await db.query('select public.book_service_page(0,$1::jsonb) value', [
      JSON.stringify({ urgency: 'unknown', label: labelId }),
    ])
  ).rows[0].value;
  assert.equal(unknownUrgency.total, 1);
  assert.equal(unknownUrgency.rows[0].id, historyId);
  assert.equal(
    Object.values(unknownUrgency.counts).reduce((a, b) => a + b, 0),
    1,
  );
  await assert.rejects(
    db.query('select public.book_service_page(0,$1::jsonb)', [
      JSON.stringify({ urgency: 'invalid' }),
    ]),
    (e) => e.code === '22023',
  );
  assert.equal(filteredLabels.total, 1);
  assert.equal(filteredLabels.rows[0].id, historyId);
  assert.equal(
    Object.values(filteredLabels.counts).reduce((a, b) => a + b, 0),
    1,
  );
  assert.equal(
    (await db.query('select public.book_labels_read($1::text[]) value', [[historyId]])).rows[0]
      .value[0].version,
    1,
  );
  await assert.rejects(
    db.query("update public.book_card_labels set label_ids='{}'"),
    (e) => e.code === '42501',
  );
  await actor(admin);
  assert.deepEqual(
    (await db.query('select public.book_labels_read($1::text[]) value', [[historyId]])).rows[0]
      .value,
    [],
  );
  await assert.rejects(
    db.query('select public.book_labels_assign($1,1,$2::uuid[])', [historyId, []]),
    (e) => e.code === '42501',
  );
  assert.equal(
    (
      await db.query('select public.book_service_page(0,$1::jsonb) value', [
        JSON.stringify({ label: labelId }),
      ])
    ).rows[0].value.total,
    0,
  );
  await actor(client);
  await assert.rejects(db.query('select public.book_labels_catalog()'), (e) => e.code === '42501');
  await actor(master);
  await db.query('select public.book_labels_assign($1,1,$2::uuid[])', [historyId, []]);
  assert.equal(
    (
      await db.query('select public.book_service_page(0,$1::jsonb) value', [
        JSON.stringify({ label: labelId }),
      ])
    ).rows[0].value.total,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.book_flow_events where source='ordensServico' and action='Etiquetas atualizadas'",
      )
    ).rows[0].n,
    2,
  );
  await db.exec('reset role');
  await db.exec(
    "delete from public.book_flow_events where source='ordensServico' and action='Etiquetas atualizadas'",
  );
  await actor(master);
  const importedSummary = await activity({
    start: '2024-06-01',
    end: '2024-06-30',
    group: 'month',
    hotel: '',
    urgency: '',
    assignees: [],
  });
  assert.equal(importedSummary.metrics.created, 3);
  assert.equal(importedSummary.metrics.closed || 0, 0);
  assert.equal(
    (await db.query('select public.book_finance_history() value')).rows[0].value.records.length,
    0,
  );
  await actor(admin);
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection='ordensServico'"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select public.book_service_page(0,'{}') value")).rows[0].value.total,
    0,
  );
  assert.equal((await decision()).services.total, 0);
  assert.equal(
    (await db.query('select count(*) n from public.book_history_import_stage')).rows[0].n,
    0,
    'Carga privada não fica visível ao administrador comum',
  );
  await assert.rejects(
    db.query('insert into public.book_history_import_stage values($1,9,$2)', [
      'a'.repeat(64),
      '{"sourceRow":9}',
    ]),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.exec('delete from public.book_history_import_backups'),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  await assert.rejects(db.exec(importedPlan.sql), /já foi importado/);
  await db.exec('rollback');
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection='ordensServico'"))
      .rows[0].n,
    3,
  );
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec(
    'alter table public.book_records disable trigger book_validate_record; update public.book_records set hotel=null,data=data||\'{"hotel":"Condomínio a conferir","apartamento":"A conferir"}\' where id=\'8000000000000004\';alter table public.book_records enable trigger book_validate_record;',
  );
  await actor(master);
  await db.query(
    "select public.book_flow_comment('ordensServico','8000000000000004','Comentário preservado durante classificação')",
  );
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec(importedPlan.locations);
  const mappedRow = (
    await db.query("select * from public.book_records where id='8000000000000004'")
  ).rows[0];
  assert.equal(mappedRow.hotel, 'Unique Residence');
  assert.equal(mappedRow.data.apartamento, '1001');
  assert.equal(mappedRow.data.status, 'Aberta');
  assert.equal(mappedRow.data.titulo, '1001 UQ - Card novo');
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_flow_events where record_id='8000000000000004' and body='Comentário preservado durante classificação'",
      )
    ).rows[0].n,
    1,
  );
  await db.exec(importedPlan.locations);
  assert.equal(
    (await db.query("select version from public.book_records where id='8000000000000004'")).rows[0]
      .version,
    mappedRow.version,
  );
  await db.query(
    "insert into public.book_hotel_access(user_id,hotel) values($1,'Unique Residence') on conflict do nothing",
    [admin],
  );
  await actor(admin);
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection='ordensServico'"))
      .rows[0].n,
    1,
    'Somente histórico do condomínio autorizado fica visível',
  );
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(db.exec(importedPlan.restore), /recebeu atividades/);
  await db.exec('rollback');
  await db.exec(
    "delete from public.book_flow_events where source='ordensServico' and body='Comentário preservado durante classificação'",
  );
  await db.exec(importedPlan.restore);
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection='ordensServico'"))
      .rows[0].n,
    beforeImport,
  );
  assert.equal(
    (await db.query("select count(*) n from public.book_records where collection<>'ordensServico'"))
      .rows[0].n,
    otherCollections,
  );
  // Feedbacks são adicionados sem substituir dados ou criar serviços.
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  const { prepareFeedback } = require('../scripts/prepare-feedback-import');
  const feedbackSource = process.env.BOOK_FEEDBACK_TEST_FILE
    ? JSON.parse(readFileSync(process.env.BOOK_FEEDBACK_TEST_FILE, 'utf8'))
    : {
        sha256: 'b'.repeat(64),
        sourceFile: 'feedback.xlsx',
        rows: [
          {
            sourceRow: 2,
            Título: '1001 UQ',
            'Fase atual': 'Concluído',
            'Criado em': '45310',
            'Resposta Ao Cliente': 'Resposta original',
          },
          { sourceRow: 3, Título: '1504 Gonzaga', 'Fase atual': 'Feedback', 'Criado em': '45311' },
        ],
      };
  const feedbackPlan = prepareFeedback(feedbackSource),
    feedbackBefore = (await db.query('select count(*) n from public.book_feedbacks')).rows[0].n;
  await db.exec(feedbackPlan.setup);
  await assert.rejects(db.exec(feedbackPlan.sql), /Carga incompleta/);
  await db.exec('rollback');
  for (const batch of feedbackPlan.batches) await db.exec(batch);
  await db.exec(feedbackPlan.sql);
  assert.equal(
    (await db.query('select count(*) n from public.book_feedbacks')).rows[0].n,
    feedbackBefore + feedbackPlan.rows.length,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_flow_meta where source='feedbacks' and record_id in(select id::text from public.book_feedbacks where data#>>'{importacao,hash}'=$1)",
        [feedbackSource.sha256],
      )
    ).rows[0].n,
    feedbackPlan.rows.length,
  );
  await assert.rejects(db.exec(feedbackPlan.sql), /já importada/);
  await db.exec('rollback');
  await actor(master);
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_feedbacks where data#>>'{importacao,hash}'=$1",
        [feedbackSource.sha256],
      )
    ).rows[0].n,
    feedbackPlan.rows.length,
  );
  await assert.rejects(
    db.query('select public.book_feedback_service($1,1,$2)', [feedbackPlan.rows[0].id, '888888']),
    (e) => ['42501', '22023'].includes(e.code),
  );
  await db.exec('reset role');
  await db.query(
    "update public.book_profiles set tabs=array['feedbacks','dashboard','os'] where id=$1",
    [admin],
  );
  await actor(admin);
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_feedbacks where data#>>'{importacao,hash}'=$1",
        [feedbackSource.sha256],
      )
    ).rows[0].n,
    feedbackPlan.rows.filter((r) => r.data.hotel === 'Unique Residence').length,
  );
  await actor(client);
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.book_feedbacks where data#>>'{importacao,hash}'=$1",
        [feedbackSource.sha256],
      )
    ).rows[0].n,
    0,
  );
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  if (process.env.BOOK_HISTORY_TEST_FILE) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const fullSource = JSON.parse(
        readFileSync(process.env.BOOK_HISTORY_TEST_FILE, 'utf8').replace(/^\uFEFF/, ''),
      ),
      fullPlan = prepare(fullSource);
    await db.exec(fullPlan.sql);
    const loaded = (
      await db.query(
        "select data->>'status' status,count(*)::integer n from public.book_records where collection='ordensServico' group by 1",
      )
    ).rows;
    assert.deepEqual(Object.fromEntries(loaded.map((r) => [r.status, r.n])), fullPlan.counts);
    await actor(master);
    const lastPage = (
      await db.query("select public.book_service_page($1,'{}') value", [
        Math.floor((fullPlan.cards.length - 1) / 50) * 50,
      ])
    ).rows[0].value;
    assert.equal(lastPage.total, fullPlan.cards.length);
    assert.ok(lastPage.rows.length > 0);
    assert.equal((await decision()).services.total, fullPlan.cards.length);
    await actor(admin);
    assert.equal(
      (await db.query("select public.book_service_page(0,'{}') value")).rows[0].value.total,
      fullPlan.cards.filter((r) => r.hotel === 'Unique Residence').length,
    );
    await actor(client);
    await assert.rejects(
      db.query("select public.book_service_page(0,'{}')"),
      (e) => e.code === '42501',
    );
    console.log(
      JSON.stringify({
        historyRowsVerified: fullPlan.cards.length,
        states: fullPlan.counts,
        lastPageRows: lastPage.rows.length,
      }),
    );
  }
  await db.exec('reset role');
  await db.exec(
    "create table auth.mfa_factors(id uuid default gen_random_uuid(),user_id uuid,status text,factor_type text);create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant execute on function auth.jwt() to authenticated;",
  );
  await db.exec(migration('202611050024_card_edit.sql'));
  await db.exec(migration('202611050024_card_edit.sql'));
  await actor(master);
  const editable = (
    await db.query("select * from public.book_records where collection='ordensServico' limit 1")
  ).rows[0];
  let corrected = editable;
  for (const titulo of ['Correção primeira', 'Correção segunda']) {
    corrected = (
      await db.query('select public.book_order_edit($1,$2,$3::jsonb) value', [
        editable.id,
        Number(corrected.version),
        JSON.stringify({ titulo }),
      ])
    ).rows[0].value;
    assert.equal(corrected.data.titulo, titulo);
    assert.equal(corrected.data.status, editable.data.status);
    assert.deepEqual(corrected.data.importacao, editable.data.importacao);
    assert.deepEqual(corrected.data.fechamento, editable.data.fechamento);
  }
  await assert.rejects(
    db.query('select public.book_order_edit($1,$2,$3::jsonb)', [
      editable.id,
      Number(editable.version),
      JSON.stringify({ titulo: 'Stale' }),
    ]),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    db.query('select public.book_order_edit($1,$2,$3::jsonb)', [
      editable.id,
      Number(corrected.version),
      JSON.stringify({ status: 'Aberta' }),
    ]),
    (e) => e.code === '22023',
  );
  await actor(client);
  await assert.rejects(
    db.query('select public.book_order_edit($1,$2,$3::jsonb)', [
      editable.id,
      Number(corrected.version),
      JSON.stringify({ titulo: 'Forbidden' }),
    ]),
    (e) => e.code === '42501',
  );
  await db.exec('reset role');
  await db.exec(migration('202611040022_mfa.sql'));
  await db.exec(migration('202611040022_mfa.sql'));
  await actor(master);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal1' }),
  ]);
  assert.equal((await db.query('select public.book_is_admin() allowed')).rows[0].allowed, true);
  await db.exec('reset role');
  await db.query(
    "insert into auth.mfa_factors(user_id,status,factor_type) values($1,'verified','totp')",
    [master],
  );
  await actor(master);
  assert.equal((await db.query('select public.book_is_admin() allowed')).rows[0].allowed, false);
  assert.equal((await db.query("select public.book_can_tab('os') allowed")).rows[0].allowed, false);
  assert.equal((await db.query('select public.book_is_master() allowed')).rows[0].allowed, false);
  await assert.rejects(
    db.query("select public.book_service_page(0,'{}')"),
    (e) => e.code === '42501',
  );
  assert.equal(
    (await db.query('select id from public.book_profiles where id=$1', [master])).rows[0].id,
    master,
  );
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal2' }),
  ]);
  assert.equal((await db.query('select public.book_is_admin() allowed')).rows[0].allowed, true);
  assert.equal((await db.query("select public.book_can_tab('os') allowed")).rows[0].allowed, true);
  await actor(client);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal1' }),
  ]);
  assert.equal((await db.query('select public.book_mfa_allowed() allowed')).rows[0].allowed, true);

  await db.exec('reset role');
  await db.exec(migration('202611050025_apartment_details.sql'));
  await db.exec(migration('202611050025_apartment_details.sql'));
  await actor(master);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal2' }),
  ]);
  await db.query(
    "select public.book_catalog_add('condominium','Teste Cobertura',array['101','102','103','104'])",
  );
  const infoFields = {
    lockPassword: '000123',
    safePassword: '0012',
    wifiName: 'Rede teste',
    wifiPassword: ' senha com espaco ',
  };
  const savedInfo = (
    await db.query('select public.book_apartment_info($1,$2,0,$3::jsonb) value', [
      'Teste Cobertura',
      '101',
      JSON.stringify(infoFields),
    ])
  ).rows[0].value;
  assert.equal(savedInfo.version, 1);
  assert.deepEqual(savedInfo.fields, infoFields);
  assert.deepEqual(
    (await db.query("select public.book_apartment_info('Teste Cobertura','101') value")).rows[0]
      .value.fields,
    infoFields,
  );
  await assert.rejects(
    db.query('select public.book_apartment_info($1,$2,0,$3::jsonb)', [
      'Teste Cobertura',
      '101',
      '{}',
    ]),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(
    db.query('select * from public.book_apartment_details'),
    (e) => e.code === '42501',
  );
  const cleared = (
    await db.query("select public.book_apartment_info('Teste Cobertura','101',1,'{}') value")
  ).rows[0].value;
  assert.equal(cleared.version, 2);
  assert.deepEqual(cleared.fields, {});
  for (const [id, unit, offset] of [
    ['925001', '101', '4 months'],
    ['925002', '102', '0 months'],
    ['925003', '103', '3 months'],
  ]) {
    const date = (
      await db.query(
        "select ((now() at time zone 'America/Sao_Paulo')::date-$1::interval)::date::text value",
        [offset],
      )
    ).rows[0].value;
    await commit([
      change('vistorias', id, {
        ...inspection,
        id,
        hotel: 'Teste Cobertura',
        apartamento: unit,
        data: date,
      }),
    ]);
  }
  const covered = (await db.query('select public.book_inspection_coverage() value')).rows[0].value;
  const coverageRows = covered.rows.filter((r) => r.hotel === 'Teste Cobertura');
  assert.equal(coverageRows.length, 4);
  assert.equal(coverageRows.find((r) => r.apartment === '101').status, 'overdue');
  assert.equal(coverageRows.find((r) => r.apartment === '102').status, 'current');
  assert.equal(coverageRows.find((r) => r.apartment === '103').status, 'current');
  assert.equal(coverageRows.find((r) => r.apartment === '104').status, 'missing');
  assert.equal(
    covered.counts.total,
    covered.counts.current + covered.counts.overdue + covered.counts.missing,
  );
  await actor(client);
  await assert.rejects(
    db.query("select public.book_apartment_info('Teste Cobertura','101')"),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.query('select public.book_inspection_coverage()'),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.query("select public.book_catalog_remove('Teste Cobertura','101')"),
    (e) => e.code === '42501',
  );
  await actor(admin);
  await assert.rejects(
    db.query("select public.book_apartment_info('Teste Cobertura','101')"),
    (e) => e.code === '42501',
  );
  await actor(master);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal2' }),
  ]);
  await db.query("select public.book_catalog_remove('Teste Cobertura','101')");
  assert.equal(
    (
      await db.query(
        "select * from public.book_apartments where hotel='Teste Cobertura' and apartment='101'",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.book_records where hotel='Teste Cobertura'",
      )
    ).rows[0].n,
    3,
  );
  await assert.rejects(
    db.query("select public.book_apartment_info('Teste Cobertura','101')"),
    (e) => e.code === '22023',
  );
  await db.query("select public.book_catalog_remove('Teste Cobertura')");
  assert.equal(
    (await db.query("select * from public.book_condominiums where name='Teste Cobertura'")).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.book_apartments where hotel='Teste Cobertura'")).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.book_records where hotel='Teste Cobertura'",
      )
    ).rows[0].n,
    3,
  );

  await db.exec('reset role');
  await db.exec(migration('202611050026_inspection_dates.sql'));
  await db.exec(migration('202611050026_inspection_dates.sql'));
  await actor(master);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal2' }),
  ]);
  await db.query(
    "select public.book_catalog_add('condominium','Datas Planilha',array['101','102'])",
  );
  await db.exec('reset role');
  const { prepare: prepareInspection } = require('../scripts/prepare-inspection-import');
  const serial = (date) =>
    String(Math.round((Date.parse(date + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000));
  const reference = (
    await db.query("select (now() at time zone 'America/Sao_Paulo')::date::text value")
  ).rows[0].value;
  const baseSerial = Number(serial(reference));
  const dateSource = {
    sha256: 'b'.repeat(64),
    sourceFile: 'Datas teste.xlsx',
    sheets: [
      {
        name: 'VISTORIAS',
        rows: [
          {
            line: 2,
            values: {
              A: '101.0',
              B: 'Datas Planilha',
              C: String(baseSerial - 90),
              G: String(baseSerial),
              D: "O'Connor",
            },
          },
          {
            line: 3,
            values: {
              A: '102',
              B: 'Datas Planilha',
              C: String(baseSerial + 1),
              G: String(baseSerial + 91),
            },
          },
        ],
      },
      {
        name: 'GOV UNIQUE',
        rows: [
          {
            line: 2,
            values: {
              A: '101',
              B: 'Datas Planilha',
              C: String(baseSerial - 46),
              G: String(baseSerial - 1),
            },
          },
        ],
      },
    ],
  };
  const inspectionPlan = prepareInspection(dateSource);
  await db.exec(inspectionPlan.sql);
  await db.exec(inspectionPlan.sql);
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.book_inspection_controls where hotel='Datas Planilha'",
      )
    ).rows[0].n,
    3,
  );
  await actor(master);
  const datesCoverage = (
    await db.query('select public.book_inspection_coverage() value')
  ).rows[0].value.rows.filter((r) => r.hotel === 'Datas Planilha');
  assert.equal(datesCoverage.find((r) => r.apartment === '101').status, 'overdue');
  assert.equal(
    datesCoverage.find((r) => r.apartment === '101').checks.find((c) => c.track === 'general')
      .status,
    'current',
  );
  assert.equal(
    datesCoverage.find((r) => r.apartment === '101').checks.find((c) => c.track === 'governance')
      .status,
    'overdue',
  );
  assert.equal(datesCoverage.find((r) => r.apartment === '102').status, 'current');
  await actor(client);
  assert.equal(
    (await db.query("select * from public.book_inspection_controls where hotel='Datas Planilha'"))
      .rows.length,
    0,
  );
  await assert.rejects(
    db.query('update public.book_inspection_controls set next_date=current_date'),
    (e) => e.code === '42501',
  );

  await actor(master);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: 'aal2' }),
  ]);
  await commit([
    change('vistorias', '926001', {
      ...inspection,
      id: '926001',
      hotel: 'Datas Planilha',
      apartamento: '101',
      data: reference,
      inspectionTrack: 'general',
    }),
  ]);
  let recalculated = (
    await db.query('select public.book_inspection_coverage() value')
  ).rows[0].value.rows.find((r) => r.hotel === 'Datas Planilha' && r.apartment === '101');
  assert.equal(recalculated.checks.find((c) => c.track === 'general').last_date, reference);
  assert.equal(
    recalculated.checks.find((c) => c.track === 'general').due_date,
    require('../scripts/prepare-inspection-import').excelDate(baseSerial + 90),
  );
  assert.equal(recalculated.status, 'overdue');
  await commit([
    change('vistorias', '926002', {
      ...inspection,
      id: '926002',
      hotel: 'Datas Planilha',
      apartamento: '101',
      data: reference,
      inspectionTrack: 'governance',
    }),
  ]);
  recalculated = (
    await db.query('select public.book_inspection_coverage() value')
  ).rows[0].value.rows.find((r) => r.hotel === 'Datas Planilha' && r.apartment === '101');
  assert.equal(
    recalculated.checks.find((c) => c.track === 'governance').due_date,
    require('../scripts/prepare-inspection-import').excelDate(baseSerial + 45),
  );
  assert.equal(recalculated.status, 'current');

  await db.exec('reset role');
  await db.exec(migration('202611060027_apartment_access_fields.sql'));
  await db.exec(migration('202611060027_apartment_access_fields.sql'));
  await actor(master);
  const privateText =
    "*Type*\n*54* - 000042#\nSenha mestra: 000007#\nWiFi: Rede teste\nSenha: teste#'com-simbolos";
  const privateImport = require('../scripts/prepare-apartment-info-import').prepare(privateText);
  await db.exec('reset role');
  await db.exec(privateImport.sql);
  await actor(master);
  const importedPrivate = (await db.query("select public.book_apartment_info('Type','54') value"))
    .rows[0].value;
  assert.equal(importedPrivate.fields.lockPassword, '000042#');
  assert.equal(importedPrivate.fields.masterPassword, '000007#');
  assert.equal(importedPrivate.fields.wifiPassword, "teste#'com-simbolos");
  const manualPrivate = (
    await db.query('select public.book_apartment_info($1,$2,$3,$4::jsonb) value', [
      'Type',
      '54',
      importedPrivate.version,
      JSON.stringify({ ...importedPrivate.fields, lockPassword: 'manual-0001#' }),
    ])
  ).rows[0].value;
  await db.exec('reset role');
  await db.exec(privateImport.sql);
  await actor(master);
  const preservedPrivate = (await db.query("select public.book_apartment_info('Type','54') value"))
    .rows[0].value;
  assert.equal(preservedPrivate.fields.lockPassword, 'manual-0001#');
  assert.equal(preservedPrivate.version, manualPrivate.version);
  await assert.rejects(
    db.query('select * from public.book_apartment_info_imports'),
    (e) => e.code === '42501',
  );

  await db.exec('reset role');
  await db.exec(migration('202611070028_backup_property.sql'));
  await db.exec(migration('202611070028_backup_property.sql'));
  await actor(master);
  const recovery = (
    await db.query("select public.book_backup(array['cadastros','vistorias','auditoria']) value")
  ).rows[0].value;
  assert.ok(recovery.apartment_details.some((r) => r.hotel === 'Type' && r.apartment === '54'));
  assert.ok(recovery.inspection_controls.some((r) => r.hotel === 'Datas Planilha'));
  assert.ok(recovery.apartment_details_audit.length > 0);
  const excluded = (await db.query("select public.book_backup(array['chamados']) value")).rows[0]
    .value;
  assert.equal(excluded.apartment_details, undefined);
  assert.equal(excluded.inspection_controls, undefined);
  await db.exec('reset role');
  await db.exec('begin');
  try {
    await db.exec(
      "delete from public.book_apartment_details where hotel='Type' and apartment='54';delete from public.book_inspection_controls where hotel='Datas Planilha'",
    );
    await db.query(
      'insert into public.book_apartment_details select * from jsonb_populate_recordset(null::public.book_apartment_details,$1::jsonb)',
      [
        JSON.stringify(
          recovery.apartment_details.filter((r) => r.hotel === 'Type' && r.apartment === '54'),
        ),
      ],
    );
    await db.query(
      'insert into public.book_inspection_controls select * from jsonb_populate_recordset(null::public.book_inspection_controls,$1::jsonb)',
      [JSON.stringify(recovery.inspection_controls.filter((r) => r.hotel === 'Datas Planilha'))],
    );
    assert.deepEqual(
      (
        await db.query(
          "select document from public.book_apartment_details where hotel='Type' and apartment='54'",
        )
      ).rows[0].document,
      preservedPrivate.fields,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from public.book_inspection_controls where hotel='Datas Planilha'",
        )
      ).rows[0].n,
      recovery.inspection_controls.filter((r) => r.hotel === 'Datas Planilha').length,
    );
  } finally {
    await db.exec('rollback');
  }
  await actor(client);
  await assert.rejects(
    db.query("select public.book_backup(array['cadastros'])"),
    (e) => e.code === '42501',
  );

  await db.exec('reset role');
  await db.exec(migration('202611070029_release_readiness.sql'));
  await db.exec(migration('202611070029_release_readiness.sql'));
  await db.exec('set role anon');
  assert.deepEqual((await db.query('select public.book_release_status() value')).rows[0].value, {
    release: 29,
    ready: true,
  });
  await db.exec('reset role');
  await db.exec('begin');
  try {
    await db.exec(
      'alter function public.book_backup_v27(text[]) rename to book_backup_unavailable',
    );
    assert.equal(
      (await db.query('select public.book_release_status() value')).rows[0].value.ready,
      false,
    );
  } finally {
    await db.exec('rollback');
  }
});
