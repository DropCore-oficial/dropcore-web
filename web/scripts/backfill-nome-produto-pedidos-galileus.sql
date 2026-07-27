-- Backfill pontual (2026-07-25): 11 pedidos do seller Galileus tinham nome_produto
-- vindo direto da descrição solta da Olist ("branco, GG") ou vazio (NULL) — corrigido
-- pra usar nome/cor/tamanho do nosso próprio cadastro (skus), mesma lógica que
-- web/lib/sellerOlistPedidoImport.ts::buildNomeProdutoFromSkus passou a usar pra
-- pedidos novos a partir de agora. Já aplicado em produção — não rodar de novo.

update pedidos as p
set nome_produto = v.novo_nome
from (values
  ('4822431c-6206-4f20-8d4c-3a3391dec725'::uuid, 'Camisa Manga Curta Gola Padre Tecido Xadrez Flanela - Preto E Branco - GG'),
  ('61baacdc-8c1c-44e3-b16c-05d7fba5ff30'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Bege - M'),
  ('05efb191-5f4a-465c-a414-0540d809a671'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Preto - M'),
  ('21115158-2cfa-4de9-a845-a1cb09899e05'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Azul Marinho - M'),
  ('084bbb00-291b-4a14-a733-c3b0430dec16'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Bege - M'),
  ('b04246af-beaf-4fe1-ad11-b53ae1e1aeb0'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Bege - P'),
  ('bbb4e8f4-4767-4b5f-b26b-fc784715fc2f'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Marrom - M, Camisa Manga Curta Gola Padre Tecido Dunas - Azul Marinho - M'),
  ('c9e1b8b1-3b8f-4ceb-b989-1fa73dedf7be'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Bege - GG'),
  ('51f22c21-35f4-4ed0-8e9b-dd6b169a85ae'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Branco - G'),
  ('03f40782-38aa-41ed-9071-e29dfd7dc3f5'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Preto - G'),
  ('314b2e30-8375-4fe2-b6bb-29fd242b9467'::uuid, 'Camisa Manga Curta Gola Padre Tecido Dunas - Bege - M')
) as v(id, novo_nome)
where p.id = v.id;
