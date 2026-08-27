"use client";

/**
 * Escritório 3D dos Gestores de IA — Three.js puro (imperativo, dentro de um useEffect)
 * + @tweenjs/tween.js para a animação de "andar até a reunião", replicando o padrão de
 * referência (HUD escuro tipo dashboard/game por cima do Canvas) só que com dado real do
 * DropCore em vez de número inventado. Geometria toda baixo-poli feita só com primitivas
 * (caixa, cilindro, esfera) — sem asset externo, sem textura.
 *
 * O HUD escuro fica só dentro do quadro do Canvas — o resto da página (header "Sua equipe
 * de IA", menu, cards embaixo) continua no padrão claro travado do resto do sistema.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as TWEEN from "@tweenjs/tween.js";
import { cn } from "@/lib/utils";
import { EMERALD_SCALE, PRIMARY_ACTION_BLUE_HEX, LOGO_GREEN_HEX, LOGO_NEUTRAL_LIGHT_HEX, DANGER_HEX } from "@/lib/dropcorePalette";

export type AtividadeAoVivo = {
  texto: string;
  gestor: "estoque_fulfillment" | "anuncios_seo" | "reputacao";
  tom: "sucesso" | "atencao" | "erro";
  quando: string;
};

const NOME_POR_GESTOR: Record<AtividadeAoVivo["gestor"], NomeGestor> = {
  estoque_fulfillment: "Diogo",
  anuncios_seo: "Andrey",
  reputacao: "Amanda",
};

const DOT_TOM: Record<AtividadeAoVivo["tom"], string> = {
  sucesso: "bg-emerald-500",
  atencao: "bg-amber-500",
  erro: "bg-[var(--danger)]",
};

function tempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

type NomeGestor = "Diogo" | "Andrey" | "Amanda" | "Ulisses" | "Laura" | "Tiago Silva";

const NOMES_GESTOR: NomeGestor[] = ["Diogo", "Andrey", "Amanda", "Ulisses", "Laura", "Tiago Silva"];

const SUIT_NEUTRAL = "#374151";
const SUIT_LIDER = "#022c22";

type GestorConfig = {
  funcao: string;
  icone: string;
  corDot: string;
  deskPos: [number, number, number];
  deskRot: number;
  meetingPos: [number, number, number];
  meetingRot: number;
  shirtColor: number;
  hairColor: number;
  jacketColor?: number;
  genero: "m" | "f";
};

/** Posições validadas no protótipo — mesa larga compartilhada (3 de um lado se encarando
 * 2 do outro + 1 lugar vago pra crescer) pros 5 gestores de linha, sala executiva isolada
 * pro Tiago Silva com mesa própria. Sem balcão de recepção, sem sala de jogos. */
const GESTORES: Record<NomeGestor, GestorConfig> = {
  Diogo: {
    funcao: "Risco de Ruptura",
    icone: "📦",
    corDot: SUIT_NEUTRAL,
    deskPos: [1.8, 0, 4.25],
    deskRot: 0,
    meetingPos: [-8.8, 0, -5.1],
    meetingRot: 0,
    shirtColor: 0xe6e6e6,
    hairColor: 0x3d2314,
    genero: "m",
  },
  Andrey: {
    funcao: "Anúncios & SEO",
    icone: "🏷️",
    corDot: PRIMARY_ACTION_BLUE_HEX,
    deskPos: [4, 0, 4.25],
    deskRot: 0,
    meetingPos: [-6.2, 0, -5.1],
    meetingRot: 0,
    shirtColor: 0x2d5a88,
    hairColor: 0x1f140e,
    genero: "m",
  },
  Amanda: {
    funcao: "Reputação & Atendimento",
    icone: "🎧",
    corDot: EMERALD_SCALE[600],
    deskPos: [6.2, 0, 4.25],
    deskRot: 0,
    meetingPos: [-8.8, 0, -7.9],
    meetingRot: Math.PI,
    shirtColor: 0xe2e8f0,
    hairColor: 0x8d5524,
    genero: "f",
  },
  Ulisses: {
    funcao: "Ads",
    icone: "📈",
    corDot: SUIT_NEUTRAL,
    deskPos: [1.8, 0, 7.75],
    deskRot: Math.PI,
    meetingPos: [-6.2, 0, -7.9],
    meetingRot: Math.PI,
    shirtColor: 0xffffff,
    hairColor: 0x4a2c11,
    genero: "m",
  },
  Laura: {
    funcao: "Design & Criativo",
    icone: "🎨",
    corDot: SUIT_NEUTRAL,
    deskPos: [4, 0, 7.75],
    deskRot: Math.PI,
    meetingPos: [-4.8, 0, -6.5],
    meetingRot: Math.PI / 2,
    shirtColor: 0xff7722,
    hairColor: 0x2b1d14,
    genero: "f",
  },
  "Tiago Silva": {
    funcao: "Gestor Mestre",
    icone: "👑",
    corDot: SUIT_LIDER,
    deskPos: [-7, 0, 8.75],
    deskRot: Math.PI,
    meetingPos: [-10.2, 0, -6.5],
    meetingRot: -Math.PI / 2,
    shirtColor: 0xf5f5f2,
    hairColor: 0x221810,
    jacketColor: 0x141b2e,
    genero: "m",
  },
};

/** Textura gerada em canvas simulando piso de madeira em tábuas corridas — tábuas com
 * tom levemente variado, veio horizontal ondulado e emenda/junta entre tábuas (em vez
 * de uma cor chapada só). */
function criarTexturaMadeira(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#6d4b2f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const numTabuas = 9;
  const alturaTabua = canvas.height / numTabuas;

  for (let i = 0; i < numTabuas; i++) {
    const y = i * alturaTabua;

    const tomTabua = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${tomTabua},${tomTabua},${tomTabua},${0.04 + Math.random() * 0.06})`;
    ctx.fillRect(0, y, canvas.width, alturaTabua);

    for (let v = 0; v < 6; v++) {
      const vy = y + Math.random() * alturaTabua;
      const tomVeio = Math.random() > 0.5 ? 255 : 0;
      ctx.strokeStyle = `rgba(${tomVeio},${tomVeio},${tomVeio},${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 1 + Math.random();
      ctx.beginPath();
      ctx.moveTo(0, vy);
      for (let x = 0; x <= canvas.width; x += 32) {
        ctx.lineTo(x, vy + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();

    const juntas = 3 + Math.floor(Math.random() * 2);
    const offset = (i % 2) * (canvas.width / (juntas * 2));
    for (let j = 0; j < juntas; j++) {
      const jx = offset + (j * canvas.width) / juntas;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(jx, y);
      ctx.lineTo(jx, y + alturaTabua);
      ctx.stroke();
    }
  }

  const textura = new THREE.CanvasTexture(canvas);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.repeat.set(5, 5);
  return textura;
}

/** Textura do logo DropCore (duas setas + "DropCore") pra placa de parede. */
function criarTexturaLogoDropCore(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const cx = canvas.width / 2;
  const cy = 150;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 26;

  const desenharSeta = (pontas: [number, number][]) => {
    ctx.beginPath();
    pontas.forEach(([x, y], i) => (i % 2 === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  };

  const setaEsquerda: [number, number][] = [
    [cx + 10, cy], [cx - 90, cy],
    [cx - 90, cy], [cx - 40, cy - 55],
    [cx - 90, cy], [cx - 40, cy + 55],
  ];
  const setaDireita: [number, number][] = [
    [cx - 10, cy], [cx + 90, cy],
    [cx + 90, cy], [cx + 40, cy - 55],
    [cx + 90, cy], [cx + 40, cy + 55],
  ];

  ctx.font = "bold 130px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const dropWidth = ctx.measureText("DROP").width;
  const coreWidth = ctx.measureText("CORE").width;
  const startX = cx - (dropWidth + coreWidth) / 2;

  // Cores do tema escuro do logo — "Drop" claro (preto sumiria numa parede preta), "Core" verde igual.
  // Brilho (halo desfocado) primeiro, atrás de tudo.
  ctx.strokeStyle = LOGO_NEUTRAL_LIGHT_HEX;
  ctx.shadowColor = LOGO_NEUTRAL_LIGHT_HEX;
  ctx.shadowBlur = 12;
  desenharSeta(setaEsquerda);
  ctx.strokeStyle = LOGO_GREEN_HEX;
  ctx.shadowColor = LOGO_GREEN_HEX;
  ctx.shadowBlur = 12;
  desenharSeta(setaDireita);
  ctx.shadowColor = LOGO_NEUTRAL_LIGHT_HEX;
  ctx.fillStyle = LOGO_NEUTRAL_LIGHT_HEX;
  ctx.fillText("DROP", startX, 340);
  ctx.shadowColor = LOGO_GREEN_HEX;
  ctx.fillStyle = LOGO_GREEN_HEX;
  ctx.fillText("CORE", startX + dropWidth, 340);

  // Forma nítida por cima, sem blur, pra não ficar tudo borrado.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = LOGO_NEUTRAL_LIGHT_HEX;
  desenharSeta(setaEsquerda);
  ctx.strokeStyle = LOGO_GREEN_HEX;
  desenharSeta(setaDireita);
  ctx.fillStyle = LOGO_NEUTRAL_LIGHT_HEX;
  ctx.fillText("DROP", startX, 340);
  ctx.fillStyle = LOGO_GREEN_HEX;
  ctx.fillText("CORE", startX + dropWidth, 340);

  return new THREE.CanvasTexture(canvas);
}

/** Materiais compartilhados pela cena inteira — criados uma vez fora do useEffect não dá
 * (dependem de THREE só existir no client), então ficam dentro da função de montagem. */
function criarMateriais() {
  return {
    floorMadeira: new THREE.MeshStandardMaterial({ map: criarTexturaMadeira(), roughness: 0.75 }),
    floorExecutivo: new THREE.MeshStandardMaterial({ color: 0x536880, roughness: 0.75 }),
    rugGray: new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.9 }),
    leatherBlack: new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.35, metalness: 0.05 }),
    wallAccent: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.6 }),
    wallLogo: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }),
    woodLight: new THREE.MeshStandardMaterial({ color: 0xd8b18a, roughness: 0.4 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x5a3e2b, roughness: 0.5 }),
    woodMedio: new THREE.MeshStandardMaterial({ color: 0x9c6b43, roughness: 0.4 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.4, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xcee7ff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.85,
      ior: 1.5,
    }),
    screenGlow: new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.3 }),
    chairBlack: new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.55 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xf5cda7, roughness: 0.6 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff }),
    eye: new THREE.MeshStandardMaterial({ color: 0x201a17 }),
    nose: new THREE.MeshStandardMaterial({ color: 0xeab690, roughness: 0.6 }),
    cheek: new THREE.MeshStandardMaterial({ color: 0xf2a89a, transparent: true, opacity: 0.5 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xa85d54 }),
    tie: new THREE.MeshStandardMaterial({ color: 0x10131a }),
  };
}
type Materiais = ReturnType<typeof criarMateriais>;

function criarDivisoriaVidro(
  mats: Materiais,
  x: number,
  z: number,
  w: number,
  len: number,
  h = 5
): THREE.Group {
  const grupo = new THREE.Group();
  const vidro = new THREE.Mesh(new THREE.BoxGeometry(w || 0.12, h, len || 0.12), mats.glass);
  vidro.position.y = h / 2;
  grupo.add(vidro);

  const travessa = new THREE.Mesh(
    new THREE.BoxGeometry(w ? w + 0.1 : 0.15, 0.15, len ? len + 0.1 : 0.15),
    mats.blackMetal
  );
  travessa.position.y = h;
  travessa.castShadow = true;
  grupo.add(travessa);

  const colGeo = new THREE.BoxGeometry(0.15, h, 0.15);
  const col1 = new THREE.Mesh(colGeo, mats.blackMetal);
  col1.position.set(w ? -w / 2 : 0, h / 2, len ? -len / 2 : 0);
  col1.castShadow = true;
  grupo.add(col1);
  const col2 = new THREE.Mesh(colGeo, mats.blackMetal);
  col2.position.set(w ? w / 2 : 0, h / 2, len ? len / 2 : 0);
  col2.castShadow = true;
  grupo.add(col2);

  grupo.position.set(x, 0, z);
  return grupo;
}

function criarCadeira(mats: Materiais): THREE.Group {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.85), mats.chairBlack);
  seat.position.set(0, 1.0, 0);
  seat.castShadow = true;
  g.add(seat);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.05, 0.1), mats.chairBlack);
  backrest.position.set(0, 1.5, -0.4);
  backrest.castShadow = true;
  g.add(backrest);
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.1), mats.chairBlack);
  headrest.position.set(0, 2.15, -0.4);
  g.add(headrest);
  const baseCol = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 10), mats.blackMetal);
  baseCol.position.y = 0.45;
  g.add(baseCol);
  const legCross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), mats.blackMetal);
  legCross.position.y = 0.05;
  g.add(legCross);
  return g;
}

/** Assento estofado preto — `largura` 0.95 gera poltrona, 2.2 gera sofá de 3 lugares.
 * Frente (lado do encosto aberto) sempre em +x local; usado pelas duas salas de estar. */
function criarAssentoEstofado(mats: Materiais, largura: number): THREE.Group {
  const g = new THREE.Group();
  const alturaAssento = 0.5;
  const profundidade = 0.85;

  const almofada = new THREE.Mesh(new THREE.BoxGeometry(profundidade, 0.34, largura), mats.leatherBlack);
  almofada.position.set(0, alturaAssento, 0);
  almofada.castShadow = true;
  g.add(almofada);

  const encosto = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, largura), mats.leatherBlack);
  encosto.position.set(-profundidade / 2 + 0.05, alturaAssento + 0.5, 0);
  encosto.castShadow = true;
  g.add(encosto);

  // Costura entre almofadas — sem isso um sofá largo vira uma tábua lisa desproporcional.
  const numAssentos = Math.max(1, Math.round(largura / 1.05));
  const costuraGeo = new THREE.BoxGeometry(profundidade - 0.06, 0.02, 0.03);
  const costuraEncostoGeo = new THREE.BoxGeometry(0.18, 0.82, 0.03);
  for (let i = 1; i < numAssentos; i++) {
    const cz = -largura / 2 + (largura / numAssentos) * i;
    const costura = new THREE.Mesh(costuraGeo, mats.blackMetal);
    costura.position.set(0.02, alturaAssento + 0.17, cz);
    g.add(costura);
    const costuraEncosto = new THREE.Mesh(costuraEncostoGeo, mats.blackMetal);
    costuraEncosto.position.set(-profundidade / 2 + 0.17, alturaAssento + 0.5, cz);
    g.add(costuraEncosto);
  }

  const bracoGeo = new THREE.BoxGeometry(profundidade + 0.1, 0.62, 0.16);
  [-(largura / 2) + 0.08, largura / 2 - 0.08].forEach((bz) => {
    const braco = new THREE.Mesh(bracoGeo, mats.leatherBlack);
    braco.position.set(-0.05, alturaAssento + 0.18, bz);
    braco.castShadow = true;
    g.add(braco);
  });

  const peGeo = new THREE.BoxGeometry(0.08, 0.28, 0.08);
  const posPe: [number, number][] = [
    [-profundidade / 2 + 0.12, -(largura / 2) + 0.12],
    [-profundidade / 2 + 0.12, largura / 2 - 0.12],
    [profundidade / 2 - 0.12, -(largura / 2) + 0.12],
    [profundidade / 2 - 0.12, largura / 2 - 0.12],
  ];
  // Pé extra a cada divisão de assento — sofá comprido não pode ficar só com pé nas pontas.
  for (let i = 1; i < numAssentos; i++) {
    const cz = -largura / 2 + (largura / numAssentos) * i;
    posPe.push([-profundidade / 2 + 0.12, cz], [profundidade / 2 - 0.12, cz]);
  }
  posPe.forEach(([px, pz]) => {
    const pe = new THREE.Mesh(peGeo, mats.blackMetal);
    pe.position.set(px, 0.14, pz);
    g.add(pe);
  });

  return g;
}

/** Mesinha lateral de madeira (tampo redondo + 3 pernas finas) com pilha de "livros"
 * decorativos em cima — fica no vão entre o sofá e a poltrona, igual à referência. */
function criarMesaLateral(mats: Materiais): THREE.Group {
  const g = new THREE.Group();
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 20), mats.woodMedio);
  tampo.position.y = 0.55;
  tampo.castShadow = true;
  g.add(tampo);

  const raio = 0.22;
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), mats.blackMetal);
    perna.position.set(Math.cos(ang) * raio, 0.275, Math.sin(ang) * raio);
    g.add(perna);
  }

  [0x1c1c1c, 0xb08d57, 0x2b2b2b].forEach((cor, i) => {
    const livro = new THREE.Mesh(
      new THREE.BoxGeometry(0.26 - i * 0.03, 0.05, 0.19 - i * 0.02),
      new THREE.MeshStandardMaterial({ color: cor, roughness: 0.5 })
    );
    livro.position.set(0, 0.58 + i * 0.05, 0);
    livro.castShadow = true;
    g.add(livro);
  });

  return g;
}

function criarTapete(mats: Materiais, largura: number, profundidade: number): THREE.Mesh {
  const tapete = new THREE.Mesh(new THREE.BoxGeometry(largura, 0.04, profundidade), mats.rugGray);
  tapete.position.y = 0.021;
  tapete.receiveShadow = true;
  return tapete;
}

/** Abajur de chão (base + haste de madeira + cúpula com brilho quente) — mesmo estilo
 * da referência de sala de estar, fica ao lado do sofá/poltrona. */
function criarAbajur(mats: Materiais): THREE.Group {
  const g = new THREE.Group();
  const peBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), mats.blackMetal);
  peBase.position.y = 0.015;
  g.add(peBase);

  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8), mats.woodMedio);
  haste.position.y = 0.68;
  g.add(haste);

  const cupula = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.42, 16),
    new THREE.MeshStandardMaterial({ color: 0x201a12, roughness: 0.6 })
  );
  cupula.position.y = 1.55;
  g.add(cupula);

  const luz = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.17, 0.32, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a2f1e, emissive: 0xffb463, emissiveIntensity: 0.7, roughness: 0.6 })
  );
  luz.position.y = 1.54;
  g.add(luz);

  return g;
}

/** Tapete do mesmo tamanho do carpete da sala do Tiago (6.6×4.9, sem giro) — as duas
 * poltronas lado a lado, ambas de costas pra mesa dos 5 gestores; sofá grande na frente
 * das poltronas, virado pra elas; mesinha lateral no meio dos dois; abajur do lado do sofá. */
function criarSalaEstar(mats: Materiais, sofaLargura = 2.2, larguraPoltrona = 1.4): THREE.Group {
  const grupo = new THREE.Group();

  const tapete = criarTapete(mats, 6.6, 4.9);
  grupo.add(tapete);

  const gapPoltronas = 1.75; // mesmo vão que existe entre as poltronas e o sofá
  const offsetPoltrona = larguraPoltrona / 2 + gapPoltronas / 2;

  const poltrona1 = criarAssentoEstofado(mats, larguraPoltrona);
  poltrona1.position.set(-offsetPoltrona, 0, -1.3);
  poltrona1.rotation.y = -Math.PI / 2;
  grupo.add(poltrona1);

  const poltrona2 = criarAssentoEstofado(mats, larguraPoltrona);
  poltrona2.position.set(offsetPoltrona, 0, -1.3);
  poltrona2.rotation.y = -Math.PI / 2;
  grupo.add(poltrona2);

  const sofa = criarAssentoEstofado(mats, sofaLargura);
  sofa.position.set(0, 0, 1.3);
  sofa.rotation.y = Math.PI / 2;
  grupo.add(sofa);

  const mesaLateral = criarMesaLateral(mats);
  mesaLateral.position.set(0, 0, -1.3);
  grupo.add(mesaLateral);

  const abajur = criarAbajur(mats);
  abajur.position.set(-(sofaLargura / 2 + 0.5), 0, 1.3);
  grupo.add(abajur);

  return grupo;
}

function criarMonitorGrande(mats: Materiais, localX: number, lado: "A" | "B"): THREE.Group {
  const grupo = new THREE.Group();
  const z = lado === "A" ? -1.0 : 1.0;
  const tela = lado === "A" ? -1 : 1;

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.13), mats.blackMetal);
  stand.position.set(localX, 1.6, z);
  grupo.add(stand);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.58, 0.04), mats.blackMetal);
  screen.position.set(localX, 2.0, z - tela * 0.01);
  screen.castShadow = true;
  grupo.add(screen);

  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.5), mats.screenGlow);
  display.position.set(localX, 2.0, z - tela * 0.023);
  display.rotation.y = tela === -1 ? Math.PI : 0;
  grupo.add(display);

  return grupo;
}

/** Personagem "chibi" estilo The Sims — cabeça grande, corpo arredondado, rosto simples
 * (olhos + sobrancelha + nariz + boca), cabelo com franja/lateral (rabo de cavalo se
 * `genero==='f'`), terno com lapela em V só quando `jacketColor` existe (o Tiago Silva). */
function criarPersonagem(mats: Materiais, cfg: GestorConfig): THREE.Group {
  const charGroup = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: cfg.shirtColor, roughness: 0.55 });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), torsoMat);
  torso.scale.set(1.05, 1.1, 0.82);
  torso.position.y = 1.44;
  torso.castShadow = true;
  charGroup.add(torso);

  if (cfg.jacketColor !== undefined) {
    const jacketMat = new THREE.MeshStandardMaterial({ color: cfg.jacketColor, roughness: 0.45 });
    const jacketFront = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.68, 0.06), jacketMat);
    jacketFront.position.set(0, 1.44, 0.285);
    jacketFront.castShadow = true;
    charGroup.add(jacketFront);

    const shirtInsert = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.42, 0.065),
      new THREE.MeshStandardMaterial({ color: cfg.shirtColor })
    );
    shirtInsert.position.set(0, 1.56, 0.315);
    charGroup.add(shirtInsert);

    const lapelGeo = new THREE.BoxGeometry(0.15, 0.32, 0.03);
    [-1, 1].forEach((side) => {
      const lapel = new THREE.Mesh(lapelGeo, jacketMat);
      lapel.position.set(side * 0.1, 1.7, 0.32);
      lapel.rotation.z = -side * 0.5;
      charGroup.add(lapel);

      const collarTip = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.09, 0.032),
        new THREE.MeshStandardMaterial({ color: cfg.shirtColor })
      );
      collarTip.position.set(side * 0.075, 1.78, 0.325);
      collarTip.rotation.z = -side * 0.45;
      charGroup.add(collarTip);
    });

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.02), mats.tie);
    tie.position.set(0, 1.5, 0.33);
    charGroup.add(tie);

    const jacketShoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), jacketMat);
    jacketShoulderL.position.set(-0.3, 1.78, 0);
    charGroup.add(jacketShoulderL);
    const jacketShoulderR = jacketShoulderL.clone();
    jacketShoulderR.position.x = 0.3;
    charGroup.add(jacketShoulderR);
  } else {
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.09, 0.05),
      new THREE.MeshStandardMaterial({ color: cfg.shirtColor })
    );
    collar.position.set(0, 1.78, 0.28);
    charGroup.add(collar);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), mats.skin);
  neck.position.y = 1.85;
  charGroup.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 22, 20), mats.skin);
  head.position.y = 2.16;
  head.castShadow = true;
  charGroup.add(head);

  const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hairColor, roughness: 0.85 });
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hair.position.y = 2.25;
  charGroup.add(hair);

  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeWhiteGeo = new THREE.SphereGeometry(0.05, 8, 8);
  [-1, 1].forEach((side) => {
    const eyeWhite = new THREE.Mesh(eyeWhiteGeo, mats.eyeWhite);
    eyeWhite.scale.set(1, 1, 0.5);
    eyeWhite.position.set(side * 0.13, 2.17, 0.335);
    charGroup.add(eyeWhite);
    const pupil = new THREE.Mesh(eyeGeo, mats.eye);
    pupil.position.set(side * 0.13, 2.17, 0.36);
    charGroup.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.02), hairMat);
    brow.position.set(side * 0.13, 2.225, 0.35);
    brow.rotation.z = -side * 0.12;
    charGroup.add(brow);
  });

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mats.nose);
  nose.scale.set(0.8, 1, 0.9);
  nose.position.set(0, 2.12, 0.375);
  charGroup.add(nose);

  const cheekGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const cheekL = new THREE.Mesh(cheekGeo, mats.cheek);
  cheekL.position.set(-0.2, 2.08, 0.3);
  cheekL.scale.set(1, 0.7, 0.4);
  charGroup.add(cheekL);
  const cheekR = cheekL.clone();
  cheekR.position.x = 0.2;
  charGroup.add(cheekR);

  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 12, Math.PI * 0.85), mats.lip);
  smile.position.set(0, 2.075, 0.35);
  smile.rotation.set(Math.PI * 0.06, 0, Math.PI * 1.075);
  charGroup.add(smile);

  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.16), hairMat);
  fringe.position.set(0, 2.34, 0.24);
  fringe.rotation.x = -0.25;
  charGroup.add(fringe);
  [-1, 1].forEach((side) => {
    const sideHair = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.3), hairMat);
    sideHair.position.set(side * 0.33, 2.16, 0.02);
    charGroup.add(sideHair);
  });

  if (cfg.genero === "f") {
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.44, 10), hairMat);
    ponytail.position.set(0, 1.98, -0.26);
    ponytail.rotation.x = Math.PI * 0.06;
    charGroup.add(ponytail);
    const ponytailTie = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.014, 8, 12),
      new THREE.MeshStandardMaterial({ color: 0x2b2118 })
    );
    ponytailTie.position.set(0, 2.18, -0.24);
    ponytailTie.rotation.x = Math.PI / 2;
    charGroup.add(ponytailTie);
  }

  const braçoMat =
    cfg.jacketColor !== undefined
      ? new THREE.MeshStandardMaterial({ color: cfg.jacketColor, roughness: 0.45 })
      : torsoMat;
  const armGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.55, 10);
  const armL = new THREE.Mesh(armGeo, braçoMat);
  armL.position.set(-0.36, 1.58, 0.22);
  armL.rotation.x = -Math.PI / 3.1;
  charGroup.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  charGroup.add(armR);

  const handGeo = new THREE.SphereGeometry(0.08, 10, 10);
  const handL = new THREE.Mesh(handGeo, mats.skin);
  handL.position.set(-0.36, 1.44, 0.5);
  charGroup.add(handL);
  const handR = new THREE.Mesh(handGeo, mats.skin);
  handR.position.set(0.36, 1.44, 0.5);
  charGroup.add(handR);

  return charGroup;
}

function criarAgente(mats: Materiais, cfg: GestorConfig): THREE.Group {
  const grupo = new THREE.Group();
  grupo.add(criarCadeira(mats));
  grupo.add(criarPersonagem(mats, cfg));
  grupo.position.set(...cfg.deskPos);
  grupo.rotation.y = cfg.deskRot;
  return grupo;
}

const NOMES_FOCO = NOMES_GESTOR;

function statusPorNome(
  nome: NomeGestor,
  statusDiogo: string,
  statusAndrey: string,
  statusAmanda: string
): string {
  if (nome === "Diogo") return statusDiogo;
  if (nome === "Andrey") return statusAndrey;
  if (nome === "Amanda") return statusAmanda;
  if (nome === "Tiago Silva") return "Supervisiona a operação e prioriza as decisões dos outros gestores.";
  return "Em breve — painel ainda não construído.";
}

type CenaAPI = {
  focar: (nome: NomeGestor) => void;
  setModo: (modo: "individual" | "reuniao") => void;
  resetarVisaoGeral: () => void;
};

export function SellerGestoresIaEscritorio3D({
  statusDiogo,
  statusAndrey,
  statusAmanda,
  atividades,
}: {
  statusDiogo: string;
  statusAndrey: string;
  statusAmanda: string;
  atividades: AtividadeAoVivo[];
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<CenaAPI | null>(null);
  const [focoNome, setFocoNome] = useState<NomeGestor | null>(null);
  const [modo, setModoState] = useState<"individual" | "reuniao">("individual");

  useEffect(() => {
    const container = mountRef.current;
    const labelsContainer = labelsRef.current;
    if (!container || !labelsContainer) return;

    const mats = criarMateriais();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c212c);
    scene.fog = new THREE.FogExp2(0x1c212c, 0.006);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 450;
    const d = 16;
    const camera = new THREE.OrthographicCamera(
      (-d * width) / height,
      (d * width) / height,
      d,
      -d,
      1,
      1000
    );
    camera.position.set(28, 26, 28);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 10;
    controls.maxDistance = 60;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x394a5c, 0.7));
    const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.8);
    dirLight.position.set(30, 45, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -22;
    dirLight.shadow.camera.right = 22;
    dirLight.shadow.camera.top = 22;
    dirLight.shadow.camera.bottom = -22;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const orangeFill = new THREE.PointLight(0xff5500, 2.2, 40);
    orangeFill.position.set(-8, 10, -6);
    scene.add(orangeFill);
    const blueAccent = new THREE.PointLight(0x00a8ff, 1.4, 35);
    blueAccent.position.set(12, 8, 12);
    scene.add(blueAccent);

    const office = new THREE.Group();
    scene.add(office);

    // Piso + carpete da sala executiva
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 24), mats.floorMadeira);
    floorMesh.position.set(0, -0.3, 0);
    floorMesh.receiveShadow = true;
    office.add(floorMesh);

    const execFloor = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.05, 4.9), mats.floorExecutivo);
    execFloor.position.set(-7, 0.02, 7.45);
    execFloor.receiveShadow = true;
    office.add(execFloor);

    // Paredes laranja
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(26, 7.5, 0.5), mats.wallAccent);
    backWall.position.set(0, 3.75, -12);
    backWall.receiveShadow = true;
    backWall.castShadow = true;
    office.add(backWall);
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 24), mats.wallLogo);
    sideWall.position.set(-13, 3.75, 0);
    sideWall.receiveShadow = true;
    sideWall.castShadow = true;
    office.add(sideWall);

    // Logo DropCore na parede lateral, no vão entre a sala de reunião e a sala do Tiago
    const logoDropCore = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.8),
      new THREE.MeshBasicMaterial({ map: criarTexturaLogoDropCore(), transparent: true, fog: false, toneMapped: false })
    );
    logoDropCore.position.set(-12.68, 4.2, 0.5);
    logoDropCore.rotation.y = Math.PI / 2;
    office.add(logoDropCore);

    // Relógio digital de parede — hora real de Brasília, atualiza sozinho
    const CLOCK_X = 8.2;
    const CLOCK_Y = 5.5;
    const CLOCK_Z = -11.7;
    const clockFrame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.88, 0.08), mats.blackMetal);
    clockFrame.position.set(CLOCK_X, CLOCK_Y, CLOCK_Z);
    office.add(clockFrame);

    const clockCanvas = document.createElement("canvas");
    clockCanvas.width = 260;
    clockCanvas.height = 120;
    const clockCtx = clockCanvas.getContext("2d")!;
    const clockTexture = new THREE.CanvasTexture(clockCanvas);

    function desenharHoraDigital() {
      clockCtx.fillStyle = "#0a0a0a";
      clockCtx.fillRect(0, 0, clockCanvas.width, clockCanvas.height);
      const hora = new Date().toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
      clockCtx.fillStyle = DANGER_HEX;
      clockCtx.font = "bold 64px monospace";
      clockCtx.textAlign = "center";
      clockCtx.textBaseline = "middle";
      clockCtx.fillText(hora, clockCanvas.width / 2, clockCanvas.height / 2 + 4);
      clockTexture.needsUpdate = true;
    }
    desenharHoraDigital();
    const clockIntervalId = window.setInterval(desenharHoraDigital, 1000);

    const clockDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(1.68, 0.73),
      new THREE.MeshBasicMaterial({ map: clockTexture, fog: false, toneMapped: false })
    );
    clockDisplay.position.set(CLOCK_X, CLOCK_Y, CLOCK_Z + 0.045);
    office.add(clockDisplay);

    // Salas de vidro — executiva do Tiago Silva + conferência
    office.add(criarDivisoriaVidro(mats, -7, 10, 7, 0));
    office.add(criarDivisoriaVidro(mats, -10.5, 7.5, 0, 5.2));
    office.add(criarDivisoriaVidro(mats, -3.5, 7.5, 0, 5.2));
    office.add(criarDivisoriaVidro(mats, -7.5, -9, 7.2, 0));
    office.add(criarDivisoriaVidro(mats, -11, -6.5, 0, 5.2));
    office.add(criarDivisoriaVidro(mats, -4, -6.5, 0, 5.2));

    // Mesa larga compartilhada (3 de um lado, 2 do outro + 1 lugar vago)
    const teamTable = new THREE.Group();
    teamTable.position.set(4, 0, 6);
    office.add(teamTable);

    const teamTableTop = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.08, 2.6), mats.woodMedio);
    teamTableTop.position.y = 1.4;
    teamTableTop.castShadow = true;
    teamTableTop.receiveShadow = true;
    teamTable.add(teamTableTop);

    [-3.62, 3.62].forEach((lx) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 2.5), mats.blackMetal);
      panel.position.set(lx, 0.7, 0);
      panel.castShadow = true;
      teamTable.add(panel);
    });

    const TEAM_SEAT_X = [-2.2, 0, 2.2];
    TEAM_SEAT_X.forEach((sx) => {
      teamTable.add(criarMonitorGrande(mats, sx, "A"));
      teamTable.add(criarMonitorGrande(mats, sx, "B"));
    });

    const cadeiraVaga = criarCadeira(mats);
    cadeiraVaga.position.set(4 + TEAM_SEAT_X[2], 0, 7.75);
    cadeiraVaga.rotation.y = Math.PI;
    office.add(cadeiraVaga);

    // Sala de conferência — mesa branca + quadro
    const confTable = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.12, 2.4), mats.woodMedio);
    confTable.position.set(-7.5, 1.4, -6.5);
    confTable.castShadow = true;
    confTable.receiveShadow = true;
    office.add(confTable);
    const confBaseGeo = new THREE.BoxGeometry(0.3, 1.4, 1.6);
    const cb1 = new THREE.Mesh(confBaseGeo, mats.blackMetal);
    cb1.position.set(-9.8, 0.7, -6.5);
    cb1.castShadow = true;
    office.add(cb1);
    const cb2 = new THREE.Mesh(confBaseGeo, mats.blackMetal);
    cb2.position.set(-5.2, 0.7, -6.5);
    cb2.castShadow = true;
    office.add(cb2);
    const whiteboard = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 0.05), mats.white);
    whiteboard.position.set(-7.5, 4.3, -8.85);
    office.add(whiteboard);
    const whiteboardFrame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.3, 0.03), mats.blackMetal);
    whiteboardFrame.position.set(-7.5, 4.3, -8.88);
    office.add(whiteboardFrame);

    // Mesa do Tiago Silva + 2 monitores
    const execTable = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 1.6), mats.woodMedio);
    execTable.position.set(-7, 1.4, 7.6);
    execTable.castShadow = true;
    execTable.receiveShadow = true;
    office.add(execTable);
    const eb1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 1.4), mats.blackMetal);
    eb1.position.set(-8.4, 0.7, 7.6);
    office.add(eb1);
    const eb2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 1.4), mats.blackMetal);
    eb2.position.set(-5.6, 0.7, 7.6);
    office.add(eb2);
    [-0.65, 0.65].forEach((mx) => {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), mats.blackMetal);
      stand.position.set(-7 + mx, 1.63, 8.15);
      office.add(stand);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.6, 0.04), mats.blackMetal);
      screen.position.set(-7 + mx, 2.05, 8.15);
      screen.castShadow = true;
      office.add(screen);
      const display = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.52), mats.screenGlow);
      display.position.set(-7 + mx, 2.05, 8.173);
      office.add(display);
    });
    const execCabinet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.5), mats.woodLight);
    execCabinet.position.set(-8.6, 0.45, 9.2);
    execCabinet.castShadow = true;
    office.add(execCabinet);

    // Sala de estar perto da mesa dos 5 gestores
    const salaEstarEquipe = criarSalaEstar(mats, 4.2);
    salaEstarEquipe.position.set(4, 0, -6.5);
    salaEstarEquipe.scale.setScalar(1.4);
    office.add(salaEstarEquipe);

    // Cenografia de fundo — estante, bebedouro
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-1.8, 0, -11.2);
    const shelfFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.2, 0.9), mats.blackMetal);
    shelfFrame.position.y = 2.1;
    shelfGroup.add(shelfFrame);
    const binderColors = [0x00d26a, 0x00a8ff, 0xff5500, 0xfadb14];
    for (let i = 0; i < 4; i++) {
      const binder = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.6, 0.7),
        new THREE.MeshStandardMaterial({ color: binderColors[i] })
      );
      binder.position.set(-0.8 + i * 0.5, 2.6, 0);
      shelfGroup.add(binder);
    }
    office.add(shelfGroup);

    const coolerGroup = new THREE.Group();
    coolerGroup.position.set(11.5, 0, -8);
    const coolerBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), mats.white);
    coolerBody.position.y = 1.1;
    coolerGroup.add(coolerBody);
    const bottleMat = new THREE.MeshPhysicalMaterial({ color: 0x00a8ff, transparent: true, opacity: 0.75, roughness: 0.1 });
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 16), bottleMat);
    bottle.position.y = 2.65;
    coolerGroup.add(bottle);
    office.add(coolerGroup);

    // Os 6 gestores
    const agentMeshes: Partial<Record<NomeGestor, THREE.Group>> = {};
    const agentLabels: Partial<Record<NomeGestor, HTMLDivElement>> = {};

    NOMES_GESTOR.forEach((nome) => {
      const cfg = GESTORES[nome];
      const grupo = criarAgente(mats, cfg);
      grupo.name = nome;
      scene.add(grupo);
      agentMeshes[nome] = grupo;

      const tag = document.createElement("div");
      tag.className =
        "pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-900/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90";
      const primeiroNome = nome.split(" ")[0];
      tag.innerHTML = `<span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background:${cfg.corDot};box-shadow:0 0 6px ${cfg.corDot}"></span>${primeiroNome.toUpperCase()}`;
      tag.addEventListener("click", () => focar(nome));
      labelsContainer.appendChild(tag);
      agentLabels[nome] = tag;
    });

    // Modo mesa vs reunião — TWEEN anima posição + rotação de verdade
    function aplicarModo(m: "individual" | "reuniao") {
      setModoState(m);
      NOMES_GESTOR.forEach((nome) => {
        const cfg = GESTORES[nome];
        const mesh = agentMeshes[nome];
        if (!mesh) return;
        const alvoPos = m === "reuniao" ? cfg.meetingPos : cfg.deskPos;
        const alvoRot = m === "reuniao" ? cfg.meetingRot : cfg.deskRot;
        new TWEEN.Tween(mesh.position)
          .to({ x: alvoPos[0], y: alvoPos[1], z: alvoPos[2] }, 1200)
          .easing(TWEEN.Easing.Cubic.InOut)
          .start();
        new TWEEN.Tween(mesh.rotation).to({ y: alvoRot }, 1000).easing(TWEEN.Easing.Cubic.InOut).start();
      });
      const alvoOlhar = m === "reuniao" ? { x: -7.5, y: 1.5, z: -6.5 } : { x: 0, y: 0, z: 0 };
      new TWEEN.Tween(controls.target).to(alvoOlhar, 1200).easing(TWEEN.Easing.Cubic.InOut).start();
    }

    function focar(nome: NomeGestor) {
      const mesh = agentMeshes[nome];
      if (!mesh) return;
      setFocoNome(nome);
      new TWEEN.Tween(controls.target)
        .to({ x: mesh.position.x, y: 1.5, z: mesh.position.z }, 900)
        .easing(TWEEN.Easing.Cubic.Out)
        .start();
    }

    function resetarVisaoGeral() {
      setFocoNome(null);
      aplicarModo("individual");
      new TWEEN.Tween(controls.target).to({ x: 0, y: 0, z: 0 }, 1000).easing(TWEEN.Easing.Cubic.Out).start();
      new TWEEN.Tween(camera.position).to({ x: 28, y: 26, z: 28 }, 1000).easing(TWEEN.Easing.Cubic.Out).start();
    }

    apiRef.current = {
      focar,
      setModo: aplicarModo,
      resetarVisaoGeral,
    };

    // Clique/raycast direto num gestor em 3D também foca (além dos botões do HUD)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    function aoClicarCanvas(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length === 0) return;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.name && NOMES_GESTOR.includes(obj.name as NomeGestor)) {
          focar(obj.name as NomeGestor);
          return;
        }
        obj = obj.parent;
      }
    }
    renderer.domElement.addEventListener("pointerdown", aoClicarCanvas);

    function aoMoverCanvas(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      let sobreAgente = false;
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
          if (obj.name && NOMES_GESTOR.includes(obj.name as NomeGestor)) {
            sobreAgente = true;
            break;
          }
          obj = obj.parent;
        }
      }
      renderer.domElement.style.cursor = sobreAgente ? "pointer" : "auto";
    }
    renderer.domElement.addEventListener("pointermove", aoMoverCanvas);

    // Loop de renderização + labels 2D flutuando sobre a cabeça de cada gestor
    const tempV = new THREE.Vector3();
    let animId = 0;
    let ativo = true;

    function onVisibility() {
      ativo = document.visibilityState === "visible";
    }
    document.addEventListener("visibilitychange", onVisibility);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!ativo) return;
      TWEEN.update();
      controls.update();

      NOMES_GESTOR.forEach((nome) => {
        const mesh = agentMeshes[nome];
        const label = agentLabels[nome];
        if (!mesh || !label) return;
        mesh.getWorldPosition(tempV);
        tempV.y += 2.8;
        tempV.project(camera);
        const x = (tempV.x * 0.5 + 0.5) * container.clientWidth;
        const y = (-(tempV.y * 0.5) + 0.5) * container.clientHeight;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
      });

      renderer.render(scene, camera);
    };
    animate();

    const aoRedimensionar = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 450;
      camera.left = (-d * w) / h;
      camera.right = (d * w) / h;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(aoRedimensionar);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      window.clearInterval(clockIntervalId);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("pointerdown", aoClicarCanvas);
      renderer.domElement.removeEventListener("pointermove", aoMoverCanvas);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      labelsContainer.innerHTML = "";
      apiRef.current = null;
    };
  }, []);

  function focarPeloHud(nome: NomeGestor) {
    apiRef.current?.focar(nome);
  }
  function modoIndividualPeloHud() {
    apiRef.current?.setModo("individual");
  }
  function modoReuniaoPeloHud() {
    apiRef.current?.setModo("reuniao");
  }
  function visaoGeralPeloHud() {
    apiRef.current?.resetarVisaoGeral();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
      <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
        <p className="text-sm font-semibold text-[var(--foreground)]">Sua equipe de IA</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Ao vivo
        </span>
      </div>

      <div className="relative mt-3 w-full overflow-hidden" style={{ aspectRatio: "16 / 9", background: "#0e1117" }}>
        <div ref={mountRef} className="absolute inset-0" />
        <div ref={labelsRef} className="pointer-events-none absolute inset-0 z-[5]" />

        {/* HUD escuro — só por cima do quadro 3D, o resto da página continua no padrão
        claro do DropCore. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="pointer-events-auto absolute left-2 top-2 hidden items-center gap-2 rounded-xl bg-neutral-900/85 px-2.5 py-1.5 shadow-lg backdrop-blur sm:flex">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <div>
              <p className="text-[10px] font-bold leading-tight text-white">ESCRITÓRIO 3D</p>
              <p className="text-[8px] leading-tight text-neutral-400">6 gestores de IA · DropCore</p>
            </div>
          </div>

          <div className="pointer-events-auto absolute right-2 top-2 hidden gap-1.5 md:flex">
            {(
              [
                ["Diogo", statusDiogo],
                ["Andrey", statusAndrey],
                ["Amanda", statusAmanda],
              ] as const
            ).map(([nome, texto]) => (
              <button
                key={nome}
                type="button"
                onClick={() => focarPeloHud(nome)}
                className="max-w-[110px] rounded-lg bg-neutral-900/85 px-2 py-1 text-right shadow-lg backdrop-blur transition-colors hover:bg-neutral-800/90"
              >
                <p className="text-[8px] uppercase tracking-wide text-neutral-400">{nome}</p>
                <p className="truncate text-[9px] font-semibold text-emerald-400">{texto}</p>
              </button>
            ))}
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-2 flex -translate-x-1/2 gap-1 rounded-full bg-neutral-900/85 p-1 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={modoIndividualPeloHud}
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors sm:px-3 sm:text-[11px]",
                modo === "individual" ? "bg-emerald-500 text-white" : "text-neutral-300 hover:text-white"
              )}
            >
              Modo Individual
            </button>
            <button
              type="button"
              onClick={modoReuniaoPeloHud}
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors sm:px-3 sm:text-[11px]",
                modo === "reuniao" ? "bg-emerald-500 text-white" : "text-neutral-300 hover:text-white"
              )}
            >
              Reunião ao Vivo
            </button>
          </div>

          <div className="pointer-events-auto absolute bottom-2 left-1/2 flex max-w-[92%] -translate-x-1/2 gap-1 overflow-x-auto rounded-full bg-neutral-900/85 p-1 shadow-lg backdrop-blur">
            {NOMES_FOCO.map((nome) => (
              <button
                key={nome}
                type="button"
                onClick={() => focarPeloHud(nome)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold transition-colors",
                  focoNome === nome ? "bg-emerald-500 text-white" : "text-neutral-300 hover:text-white"
                )}
              >
                {nome}
              </button>
            ))}
            <button
              type="button"
              onClick={visaoGeralPeloHud}
              className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold text-neutral-400 hover:text-white"
            >
              ↺ Visão geral
            </button>
          </div>

          {atividades.length > 0 ? (
            <div className="pointer-events-auto absolute bottom-11 left-2 hidden max-h-32 w-52 overflow-y-auto rounded-xl bg-neutral-900/85 p-2.5 shadow-lg backdrop-blur sm:block">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                Sincronização ao vivo
              </p>
              <div className="space-y-1.5">
                {atividades.slice(0, 4).map((a, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-[10px] leading-snug text-neutral-200">
                    <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", DOT_TOM[a.tom])} aria-hidden />
                    <span className="line-clamp-2">
                      <span className="font-semibold">{NOME_POR_GESTOR[a.gestor]}: </span>
                      {a.texto}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {focoNome ? (
            <div className="pointer-events-auto absolute bottom-11 right-2 hidden w-48 rounded-xl bg-neutral-900/85 p-3 shadow-lg backdrop-blur md:block">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
                  style={{ background: GESTORES[focoNome].corDot }}
                  aria-hidden
                >
                  {GESTORES[focoNome].icone}
                </span>
                <div>
                  <p className="text-[11px] font-bold text-white">{focoNome.toUpperCase()}</p>
                  <p className="text-[9px] text-neutral-400">{GESTORES[focoNome].funcao}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-neutral-300">
                {statusPorNome(focoNome, statusDiogo, statusAndrey, statusAmanda)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Arraste pra girar, ou use os botões pra focar num gestor.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
          <span>
            <span className="font-semibold text-[var(--foreground)]">Diogo:</span> {statusDiogo}
          </span>
          <span>
            <span className="font-semibold text-[var(--foreground)]">Andrey:</span> {statusAndrey}
          </span>
          <span>
            <span className="font-semibold text-[var(--foreground)]">Amanda:</span> {statusAmanda}
          </span>
        </div>
        {atividades.length > 0 ? (
          <div className="mt-2 space-y-1.5 border-t border-[var(--card-border)] pt-3">
            {atividades.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", DOT_TOM[a.tom])} aria-hidden />
                <p className="flex-1 text-[var(--foreground)]">
                  <span className="font-semibold">{NOME_POR_GESTOR[a.gestor]}: </span>
                  {a.texto}
                </p>
                <span className="shrink-0 whitespace-nowrap text-[var(--muted)]">{tempoRelativo(a.quando)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
