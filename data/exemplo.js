// DADOS 100% FICTÍCIOS, apenas para demonstração. Nomes, pessoas, telefones e valores são inventados.
// Coordenadas aproximadas de Teresina-PI / Timon-MA só para posicionar os pinos.
import { today } from '../js/util.js';

const d = (dias) => { const x = new Date(); x.setDate(x.getDate() - dias); return x.toISOString().slice(0, 10); };

export const EXEMPLO = () => {
  const shop = { endereco: 'Av. Exemplo, 1201 (Shopping Exemplo)', bairro: 'Ininga', lat: -5.0577, lng: -42.7902 };
  const clients = [
    // Várias lojas no mesmo endereço de shopping (testa cluster/spiderfy)
    { id: 'ex1', loja: 'Estúdio Aurora (exemplo)', pessoa: 'Maria Exemplo', ...shop, situacao: 'Adquirido e pago', telefone: '(86) 90000-0001', ultimaAcao: d(40), obs: 'Cliente fictícia.', aReceber: 0, pedidoAberto: '' },
    { id: 'ex2', loja: 'Moda Brisa (exemplo)', pessoa: 'Joana Teste', ...shop, situacao: 'Adquirido e pago', telefone: '(86) 90000-0002', ultimaAcao: d(25), obs: '', aReceber: 0, pedidoAberto: '' },
    { id: 'ex3', loja: 'Semijoias Luar (exemplo)', pessoa: 'Joana Teste', ...shop, situacao: 'Fechou - a pagar', telefone: '', ultimaAcao: d(3), obs: 'Combo de 2.', aReceber: 99, pedidoAberto: '2 × Placa NFC' },
    { id: 'ex4', loja: 'Ótica Vista Clara (exemplo)', pessoa: 'Carlos Modelo', ...shop, situacao: 'Visitado - a verificar', telefone: '', ultimaAcao: d(6), obs: 'Voltar na sexta.', aReceber: 0, pedidoAberto: '' },
    { id: 'ex5', loja: 'Celular Rápido (exemplo)', pessoa: 'Pedro Fictício', ...shop, situacao: 'Sem interesse', telefone: '', ultimaAcao: d(12), obs: 'Disse que já tem solução.', aReceber: 0, pedidoAberto: '' },
    { id: 'ex6', loja: 'Cosméticos Flor (exemplo)', pessoa: 'Ana Imaginária', ...shop, situacao: 'Agendado', telefone: '', ultimaAcao: d(1), obs: 'Reunião terça 10h.', aReceber: 0, pedidoAberto: '' },
    // Mesma pessoa, várias lojas, uma em Timon-MA
    { id: 'ex7', loja: 'Bella Fictícia Centro (exemplo)', pessoa: 'Dona Fictícia', endereco: 'Rua Exemplo, 450', bairro: 'Centro', lat: -5.0892, lng: -42.8109, situacao: 'Adquirido e pago', telefone: '(86) 90000-0007', ultimaAcao: d(32), obs: '', aReceber: 0, pedidoAberto: '' },
    { id: 'ex8', loja: 'Bella Fictícia Jóquei (exemplo)', pessoa: 'Dona Fictícia', endereco: 'Av. Exemplo Norte, 88', bairro: 'Jóquei', lat: -5.0768, lng: -42.7855, situacao: 'Fechou - a pagar', telefone: '', ultimaAcao: d(4), obs: '', aReceber: 139, pedidoAberto: '3 × Placa NFC' },
    { id: 'ex9', loja: 'Bella Fictícia Fátima (exemplo)', pessoa: 'Dona Fictícia', endereco: 'Rua Exemplo, 450', bairro: 'Centro', lat: -5.0893, lng: -42.8108, situacao: 'Visitado - a verificar', telefone: '', ultimaAcao: d(5), obs: 'Mesmo endereço do Centro (aviso de duplicidade de teste).', aReceber: 0, pedidoAberto: '' },
    { id: 'ex10', loja: 'Bella Fictícia Timon (exemplo)', pessoa: 'Dona Fictícia', endereco: 'Av. Exemplo Timon, 300', bairro: 'Centro', cidade: 'Timon - MA', lat: -5.0975, lng: -42.8330, situacao: 'Agendado', telefone: '', ultimaAcao: d(2), obs: 'Loja em Timon-MA.', aReceber: 0, pedidoAberto: '' },
    // Outros
    { id: 'ex11', loja: 'Barbearia Navalha (exemplo)', pessoa: 'Rafael Exemplo', endereco: 'Av. Exemplo Jóquei, 1500', bairro: 'Jóquei', lat: -5.0700, lng: -42.7880, situacao: 'Sugerido para visitar', telefone: '', ultimaAcao: d(0), obs: '', aReceber: 0, pedidoAberto: '' },
    { id: 'ex12', loja: 'Pizzaria Forno Bom (exemplo)', pessoa: 'Luiz Teste', endereco: 'Rua Exemplo Sul, 77', bairro: 'Fátima', lat: -5.0950, lng: -42.7820, situacao: 'Adquirido e pago', telefone: '', ultimaAcao: d(18), obs: '', aReceber: 0, pedidoAberto: '' },
    { id: 'ex13', loja: 'Salão Charme (exemplo)', pessoa: 'Paula Demo', endereco: 'Rua Exemplo Leste, 12', bairro: 'Jóquei', lat: -5.0735, lng: -42.7840, situacao: 'Adquirido e pago', telefone: '', ultimaAcao: d(10), obs: '', aReceber: 0, pedidoAberto: '' },
    { id: 'ex14', loja: 'Mercadinho Sol (exemplo)', pessoa: 'Sérgio Demo', endereco: 'Rua Exemplo Oeste, 9', bairro: 'Fátima', lat: -5.0990, lng: -42.7790, situacao: 'Sem interesse', telefone: '', ultimaAcao: d(14), obs: '', aReceber: 0, pedidoAberto: '' },
  ].map((c) => ({ cidade: 'Teresina - PI', categoria: '', ...c, exemplo: true }));

  const v = (id, dias, loja, produto, qtd, preco, custo, pag) => ({
    id, data: d(dias), produto, qtd, preco, total: qtd === 2 && preco === 49.5 ? 99 : qtd * preco, custo, lucro: (qtd === 2 && preco === 49.5 ? 99 : qtd * preco) - custo,
    obs: 'Venda fictícia', pagamento: pag, loja, exemplo: true,
  });
  const sales = [
    v('sv1', 75, 'Estúdio Aurora (exemplo)', 'Placa NFC', 1, 59.9, 18, 'Pix'),
    v('sv2', 62, 'Bella Fictícia Centro (exemplo)', 'Combo 2 Placas NFC', 2, 49.5, 36, 'Pix'),
    v('sv3', 50, 'Moda Brisa (exemplo)', 'Placa NFC', 1, 59.9, 18, 'Dinheiro'),
    v('sv4', 36, 'Pizzaria Forno Bom (exemplo)', 'Placa NFC', 1, 59.9, 18, 'Pix'),
    v('sv5', 22, 'Salão Charme (exemplo)', 'Combo 2 Placas NFC', 2, 49.5, 36, 'Cartão de débito'),
    v('sv6', 15, 'Estúdio Aurora (exemplo)', 'Placa NFC', 1, 59.9, 18, 'Pix'),
  ];
  const prices = [
    { produto: 'Placa NFC', preco: 59.9, custo: 18 },
    { produto: 'Combo 2 Placas NFC', preco: 99, custo: 36 },
    { produto: 'Combo 3 Placas NFC', preco: 139, custo: 54 },
  ];
  const leads = [
    { id: 'l1', categoria: 'Salão de beleza', nome: 'Salão Estrela (exemplo)', bairro: 'Jóquei', prioridade: 'Alta', status: 'Novo', endereco: '' },
    { id: 'l2', categoria: 'Barbearia', nome: 'Barbearia Vintage (exemplo)', bairro: 'Jóquei', prioridade: 'Alta', status: 'Novo', endereco: '' },
    { id: 'l3', categoria: 'Semijoias', nome: 'Joias Delicadas (exemplo)', bairro: 'Jóquei', prioridade: 'Média', status: 'Novo', endereco: '' },
    { id: 'l4', categoria: 'Pizzaria', nome: 'Pizza Nostra (exemplo)', bairro: 'Fátima', prioridade: 'Média', status: 'Novo', endereco: '' },
    { id: 'l5', categoria: 'Ótica', nome: 'Ótica Lente Viva (exemplo)', bairro: 'Centro', prioridade: 'Baixa', status: 'Novo', endereco: '' },
    { id: 'l6', categoria: 'Moda feminina', nome: 'Boutique Verão (exemplo)', bairro: 'Ininga', prioridade: 'Alta', status: 'Novo', endereco: '' },
  ];
  return { clients, sales, prices, leads, streets: [] };
};
export const EXEMPLO_NOTA = `Dados fictícios gerados em ${today()}.`;
