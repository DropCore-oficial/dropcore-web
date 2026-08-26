"use client";

/**
 * Escritório DropCore em 3D de verdade (React Three Fiber) — substitui a versão SVG
 * "achatada" anterior. Geometria baixo-poli feita só com primitivas (caixa, cilindro,
 * esfera) — sem asset externo, sem textura, mantém leve pra rodar bem em mobile. 4 áreas:
 * mesa principal (gestores reais), sala de reunião, sala isolada do Tiago Silva (Gestor
 * Mestre, paredes de verdade — "isolada" mesmo), sala de jogos. Diogo, Andrey e Amanda
 * aparecem "trabalhando" com dado real; os demais são estações/salas vazias "em breve".
 */
import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, RoundedBox } from "@react-three/drei";
import type { Group } from "three";
import { cn } from "@/lib/utils";
import { EMERALD_SCALE, PRIMARY_ACTION_BLUE_HEX } from "@/lib/dropcorePalette";

export type AtividadeAoVivo = {
  texto: string;
  gestor: "estoque_fulfillment" | "anuncios_seo" | "reputacao";
  tom: "sucesso" | "atencao" | "erro";
  quando: string;
};

const NOME_POR_GESTOR: Record<AtividadeAoVivo["gestor"], string> = {
  estoque_fulfillment: "Diogo",
  anuncios_seo: "Andrey",
  reputacao: "Amanda",
};

const DOT_TOM: Record<AtividadeAoVivo["tom"], string> = {
  sucesso: "bg-emerald-500",
  atencao: "bg-amber-500",
  erro: "bg-[var(--danger)]",
};

function resumoCurto(texto: string, max = 60): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

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

const SUIT_NEUTRAL = "#374151";
const SUIT_LIDER = "#022c22";
const PELE_NEUTRA = "#E8B88A";
const CABELO_ESCURO = "#2B2118";
const CABELO_CASTANHO = "#3B2A1E";
const DESK_WOOD = "#D9CBAE";
const FLOOR_COLOR = "#D6D6D2";
const GLASS_COLOR = "#E7F6FA";
const MONITOR_FRAME = "#1F2937";
const CADEIRA_BASE = "#27272A";

function Nameplate({ nome, funcao, ativo }: { nome: string; funcao: string; ativo: boolean }) {
  return (
    <Html center distanceFactor={11} zIndexRange={[10, 0]} occlude={false}>
      <div
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold shadow-sm",
          ativo ? "bg-neutral-900 text-white" : "bg-neutral-900/60 text-neutral-300"
        )}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ativo ? "bg-emerald-400" : "bg-neutral-500")} />
        {nome.toUpperCase()}
        <span className="font-normal opacity-80"> · {funcao}</span>
      </div>
    </Html>
  );
}

/** Pessoa baixo-poli "de verdade" — cabeça com tom de pele + cabelo, pescoço, tronco e
 * braços apoiados na mesa em posição de digitação, sempre com primitivas puras (sem asset
 * externo), pra chegar perto da referência do Sr Stark sem pesar a cena. `genero` só
 * controla o corte de cabelo (mais volumoso/longo pra "f", calota curta pra "m"). */
function Personagem({
  corTerno,
  apagado = false,
  genero = "m",
}: {
  corTerno: string;
  apagado?: boolean;
  genero?: "m" | "f";
}) {
  const opacity = apagado ? 0.35 : 1;
  const cabelo = genero === "f" ? CABELO_CASTANHO : CABELO_ESCURO;
  return (
    <group position={[0, 0.55, 0]}>
      {/* tronco */}
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.2, 0.42, 4, 8]} />
        <meshStandardMaterial color={corTerno} transparent opacity={opacity} />
      </mesh>
      {/* gravata/lapela */}
      <mesh position={[0, 0.38, 0.18]}>
        <boxGeometry args={[0.055, 0.3, 0.025]} />
        <meshStandardMaterial color={EMERALD_SCALE[600]} transparent opacity={opacity} />
      </mesh>
      {/* pescoço */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.08, 10]} />
        <meshStandardMaterial color={PELE_NEUTRA} transparent opacity={opacity} />
      </mesh>
      {/* cabeça */}
      <mesh position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.17, 16, 16]} />
        <meshStandardMaterial color={PELE_NEUTRA} transparent opacity={opacity} />
      </mesh>
      {/* cabelo — calota curta (m) ou volume + franja lateral (f) */}
      {genero === "f" ? (
        <>
          <mesh position={[0, 0.505, -0.015]}>
            <sphereGeometry args={[0.185, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
            <meshStandardMaterial color={cabelo} transparent opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.33, -0.09]}>
            <boxGeometry args={[0.23, 0.26, 0.09]} />
            <meshStandardMaterial color={cabelo} transparent opacity={opacity} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0.515, -0.01]}>
          <sphereGeometry args={[0.175, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
          <meshStandardMaterial color={cabelo} transparent opacity={opacity} />
        </mesh>
      )}
      {/* braços apoiados na mesa, mãos na altura do teclado */}
      {[-0.17, 0.17].map((sx, i) => (
        <group key={i} position={[sx, 0.03, 0.06]}>
          <mesh rotation={[Math.PI / 2.5, 0, 0]} position={[0, 0.02, 0.1]}>
            <cylinderGeometry args={[0.042, 0.048, 0.28, 8]} />
            <meshStandardMaterial color={corTerno} transparent opacity={opacity} />
          </mesh>
          <mesh position={[0, -0.08, 0.24]}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshStandardMaterial color={PELE_NEUTRA} transparent opacity={opacity} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const DESK_WOOD_EXECUTIVO = "#8B6239";
const DESK_BASE_PRETA = "#161616";

/** Mesa com pernas em X (hairpin/tesoura) — referência: cubículo moderno com pernas
 * abertas cruzadas, sem painel sólido embaixo. Painelzinho de privacidade atrás do monitor
 * (efeito "cubículo") + porta-retrato e vaso de flores num canto do tampo. */
function Mesa({ ligado }: { ligado: boolean }) {
  return (
    <group>
      {/* tampo */}
      <RoundedBox args={[1.0, 0.045, 0.55]} radius={0.02} position={[0, 0.5, 0]}>
        <meshStandardMaterial color={DESK_WOOD_EXECUTIVO} />
      </RoundedBox>

      {/* pernas em X nas duas pontas da mesa */}
      {[-0.42, 0.42].map((lx, i) => (
        <group key={i} position={[lx, 0.24, 0]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.48, 0.03, 0.03]} />
            <meshStandardMaterial color={DESK_BASE_PRETA} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.48, 0.03, 0.03]} />
            <meshStandardMaterial color={DESK_BASE_PRETA} />
          </mesh>
        </group>
      ))}

      {/* painel de privacidade atrás do monitor — efeito "cubículo" */}
      <mesh position={[0, 0.72, -0.26]}>
        <boxGeometry args={[0.56, 0.36, 0.015]} />
        <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.55} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.9, -0.26]}>
        <boxGeometry args={[0.56, 0.02, 0.02]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>

      {/* porta-retrato (foto de família), canto direito do tampo */}
      <group position={[0.3, 0.59, 0.05]} rotation={[-0.12, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.1, 0.13, 0.015]} />
          <meshStandardMaterial color="#3F2E1F" />
        </mesh>
        <mesh position={[0, 0, 0.009]}>
          <boxGeometry args={[0.07, 0.09, 0.006]} />
          <meshStandardMaterial color="#F5EFE3" />
        </mesh>
      </group>

      {/* vasinho de flores, canto direito do tampo */}
      <group position={[0.3, 0.57, 0.2]}>
        <mesh>
          <cylinderGeometry args={[0.028, 0.035, 0.07, 10]} />
          <meshStandardMaterial color={FLOOR_COLOR} />
        </mesh>
        {[
          [-0.02, 0.06, 0, "#F472B6"],
          [0.02, 0.065, 0.015, "#FBBF24"],
          [0, 0.07, -0.015, "#F472B6"],
        ].map(([fx, fy, fz, cor], i) => (
          <group key={i} position={[fx as number, fy as number, fz as number]}>
            <mesh>
              <cylinderGeometry args={[0.004, 0.004, 0.05, 4]} />
              <meshStandardMaterial color={EMERALD_SCALE[600]} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <sphereGeometry args={[0.018, 6, 6]} />
              <meshStandardMaterial color={cor as string} />
            </mesh>
          </group>
        ))}
      </group>

      {/* monitor */}
      <mesh position={[0, 0.78, -0.16]}>
        <boxGeometry args={[0.5, 0.34, 0.03]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      <mesh position={[0, 0.78, -0.145]}>
        <boxGeometry args={[0.42, 0.26, 0.01]} />
        <meshStandardMaterial
          color={ligado ? EMERALD_SCALE[400] : "#9CA3AF"}
          emissive={ligado ? EMERALD_SCALE[400] : "#000000"}
          emissiveIntensity={ligado ? 0.5 : 0}
        />
      </mesh>
      <mesh position={[0, 0.61, -0.16]}>
        <boxGeometry args={[0.04, 0.16, 0.04]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
    </group>
  );
}

function Cadeira({ cor = "#374151" }: { cor?: string }) {
  return (
    <group>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[0.32, 0.06, 0.32]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      <mesh position={[0, 0.5, -0.15]}>
        <boxGeometry args={[0.3, 0.4, 0.05]} />
        <meshStandardMaterial color={cor} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.28, 8]} />
        <meshStandardMaterial color={CADEIRA_BASE} />
      </mesh>
    </group>
  );
}

/** Faixa de piso levemente tingida (emerald-100) pra separar uma sala do concreto neutro
 * do resto do escritório, à mostra sem precisar girar a câmera pra entender onde é o quê. */
function PisoZona({ largura = 3.2, profundidade = 2.8 }: { largura?: number; profundidade?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
      <planeGeometry args={[largura, profundidade]} />
      <meshStandardMaterial color={EMERALD_SCALE[100]} />
    </mesh>
  );
}

type Estacao = {
  x: number;
  z?: number;
  nome: string;
  funcao: string;
  corTerno?: string;
  genero?: "m" | "f";
  ativo: boolean;
};

/** Bloco compartilhado em 2 fileiras (como um "ilhó" de bullpen) em vez de uma fila única —
 * fileira de trás (Diogo/Andrey/Amanda) + fileira da frente escalonada (Ulisses/Laura). */
const ESTACOES: Estacao[] = [
  { x: -1.8, z: -0.5, nome: "Diogo", funcao: "Risco de Ruptura", corTerno: SUIT_NEUTRAL, genero: "m", ativo: true },
  {
    x: 0,
    z: -0.5,
    nome: "Andrey",
    funcao: "Anúncios & SEO",
    corTerno: PRIMARY_ACTION_BLUE_HEX,
    genero: "m",
    ativo: true,
  },
  {
    x: 1.8,
    z: -0.5,
    nome: "Amanda",
    funcao: "Reputação & Atendimento",
    corTerno: EMERALD_SCALE[600],
    genero: "f",
    ativo: true,
  },
  { x: -0.9, z: 1.3, nome: "Ulisses", funcao: "Ads", genero: "m", ativo: false },
  { x: 0.9, z: 1.3, nome: "Laura", funcao: "Design & Criativo", genero: "f", ativo: false },
];

/** Divisória laranja entre estações vizinhas da mesma fileira — cubículo em cruz igual a
 * referência (parede alta separando cada posto, não só o painel atrás do monitor). */
const DIVISORIAS_ESTACOES: { x: number; z: number }[] = [
  { x: -0.9, z: -0.5 },
  { x: 0.9, z: -0.5 },
  { x: 0, z: 1.3 },
];

function DivisoriaEstacao({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.65, z]}>
      <boxGeometry args={[0.06, 1.3, 1.0]} />
      <meshStandardMaterial color={PERIMETER_WALL_COLOR} />
    </mesh>
  );
}

/** Todo gestor fica na própria mesa sempre — a sala de reunião não "puxa" ninguém pra
 * fora do posto, ela só mostra um resumo textual de quem tem atividade recente (ver
 * SalaReuniao). */
function AreaPrincipal() {
  return (
    <group position={[0, 0, -2.5]}>
      {ESTACOES.map((e) => (
        <group key={e.nome} position={[e.x, 0, e.z ?? 0]}>
          <group position={[0, 0, -0.5]}>
            <Personagem corTerno={e.corTerno ?? SUIT_NEUTRAL} apagado={!e.ativo} genero={e.genero} />
          </group>
          <Mesa ligado={e.ativo} />
          <group position={[0, 0, 0.35]}>
            <Cadeira />
          </group>
          {/* altura da etiqueta varia por fileira — sem isso, as 2 fileiras do bloco
          colam numa pilha ilegível quando a câmera olha quase de frente pra elas */}
          <group position={[0, (e.z ?? 0) > 0 ? 0.85 : 1.25, 0]}>
            <Nameplate nome={e.nome} funcao={e.funcao} ativo={e.ativo} />
          </group>
        </group>
      ))}
      {DIVISORIAS_ESTACOES.map((d, i) => (
        <DivisoriaEstacao key={i} x={d.x} z={d.z} />
      ))}
    </group>
  );
}

type AgenteReuniao = { nome: string; corTerno: string; texto: string; tom: AtividadeAoVivo["tom"] };

const CADEIRAS_FRENTE_X = [-0.9, -0.3, 0.3, 0.9];

function SalaReuniao({ agentes }: { agentes: AgenteReuniao[] }) {
  const emReuniao = agentes.length > 0;
  return (
    <group position={[6, 0, -3]}>
      <PisoZona />
      <RoundedBox args={[2.4, 0.55, 1.3]} radius={0.06} position={[0, 0.28, 0]}>
        <meshStandardMaterial color={DESK_WOOD} />
      </RoundedBox>
      {CADEIRAS_FRENTE_X.map((cx) => (
        <group key={`f-${cx}`} position={[cx, 0, -0.85]}>
          <Cadeira cor="#4B5563" />
        </group>
      ))}
      {[-0.9, -0.3, 0.3, 0.9].map((cx) => (
        <group key={`b-${cx}`} position={[cx, 0, 0.85]} rotation={[0, Math.PI, 0]}>
          <Cadeira cor="#4B5563" />
        </group>
      ))}
      <group position={[0, 1.1, 0]}>
        <Html center distanceFactor={11} zIndexRange={[10, 0]} occlude={false}>
          {emReuniao ? (
            <div className="w-52 space-y-1 rounded-md bg-neutral-900/85 px-2.5 py-2 text-left shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Reunião ao vivo
              </p>
              {agentes.map((a) => (
                <p key={a.nome} className="flex items-start gap-1.5 text-[10px] leading-snug text-neutral-200">
                  <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", DOT_TOM[a.tom])} aria-hidden />
                  <span className="line-clamp-1 break-words">
                    <span className="font-semibold">{a.nome}: </span>
                    {resumoCurto(a.texto)}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <div className="whitespace-nowrap rounded-md bg-neutral-900/70 px-2 py-1 text-[11px] font-semibold text-neutral-200">
              SALA DE REUNIÃO
            </div>
          )}
        </Html>
      </group>
    </group>
  );
}

function SalaTiagoSilva() {
  const wallH = 1.4;
  return (
    <group position={[6.2, 0, 2.3]}>
      <PisoZona largura={3.2} profundidade={2.6} />
      {/* divisória de vidro — sala fisicamente isolada mas visível de fora o tempo todo,
      mesmo enquanto a cena gira (em vez de parede sólida escondendo o Tiago Silva) */}
      <mesh position={[0, wallH / 2, -1.4]}>
        <boxGeometry args={[3.4, wallH, 0.05]} />
        <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.28} roughness={0.1} metalness={0.1} />
      </mesh>
      <mesh position={[-1.7, wallH / 2, 0]}>
        <boxGeometry args={[0.05, wallH, 2.8]} />
        <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.28} roughness={0.1} metalness={0.1} />
      </mesh>
      <mesh position={[1.7, wallH / 2, 0]}>
        <boxGeometry args={[0.05, wallH, 2.8]} />
        <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.28} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* moldura preta fina nos 4 cantos + travessa do topo, pra ler como vidro de
      esquadria de verdade, não uma caixa transparente lisa */}
      {[
        [-1.7, -1.4],
        [1.7, -1.4],
        [-1.7, 1.4],
        [1.7, 1.4],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, wallH / 2, pz]}>
          <boxGeometry args={[0.08, wallH, 0.08]} />
          <meshStandardMaterial color={MONITOR_FRAME} />
        </mesh>
      ))}
      <mesh position={[0, wallH, -1.4]}>
        <boxGeometry args={[3.4, 0.06, 0.08]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      <RoundedBox args={[1.3, 0.06, 0.7]} radius={0.02} position={[0, 0.5, 0]}>
        <meshStandardMaterial color={DESK_WOOD} />
      </RoundedBox>
      <group position={[0, 0, -0.55]}>
        <Personagem corTerno={SUIT_LIDER} genero="m" />
      </group>
      <group position={[0, 0, 0.5]}>
        <Cadeira cor="#022c22" />
      </group>
      <group position={[0, 1.5, 0]}>
        <Nameplate nome="Tiago Silva" funcao="Gestor Mestre" ativo />
      </group>
    </group>
  );
}

function SalaJogos() {
  return (
    <group position={[-4.6, 0, 2.2]}>
      <RoundedBox args={[1.8, 0.5, 0.9]} radius={0.05} position={[0, 0.25, 0]}>
        <meshStandardMaterial color={EMERALD_SCALE[700]} />
      </RoundedBox>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[1.7, 0.02, 0.8]} />
        <meshStandardMaterial color={EMERALD_SCALE[500]} />
      </mesh>
      <RoundedBox args={[1.4, 0.4, 0.6]} radius={0.12} position={[1.6, 0.2, 0.6]}>
        <meshStandardMaterial color="#4B5563" />
      </RoundedBox>
      <group position={[0, 1.1, 0]}>
        <Html center distanceFactor={11} occlude={false}>
          <div className="whitespace-nowrap rounded-md bg-neutral-900/70 px-2 py-1 text-[11px] font-semibold text-neutral-200">
            SALA DE JOGOS
          </div>
        </Html>
      </group>
    </group>
  );
}

/** Laranja vibrante da referência — pedido explícito do Sr Stark de replicar até a cor. */
const PERIMETER_WALL_COLOR = "#F4600B";
const CLOCK_FACE = "#FAFAF7";
const CABINET_DARK = "#5B4A36";

/** Fundo + laterais da área principal — parede cinza-clara de perímetro (como o resto do
 * escritório), painel de destaque emerald com porta de madeira ao centro, e um canto de
 * decoração (bebedouro, prateleira, relógio, armário) pra não ficar um open space nu. Não
 * fecha o teto nem a frente — segue o corte "casa de boneca" do resto da cena. */
const CAIXA_ARQUIVO_CORES = [PRIMARY_ACTION_BLUE_HEX, EMERALD_SCALE[600], "#F59E0B"];

function ParedeFundo() {
  return (
    <group>
      <mesh position={[-0.2, 0.8, -4]}>
        <boxGeometry args={[7.4, 1.6, 0.1]} />
        <meshStandardMaterial color={PERIMETER_WALL_COLOR} />
      </mesh>
      <mesh position={[-3.9, 0.8, -2.3]}>
        <boxGeometry args={[0.1, 1.6, 3.4]} />
        <meshStandardMaterial color={PERIMETER_WALL_COLOR} />
      </mesh>
      <mesh position={[3.5, 0.8, -2.3]}>
        <boxGeometry args={[0.1, 1.6, 3.4]} />
        <meshStandardMaterial color={PERIMETER_WALL_COLOR} />
      </mesh>

      {/* porta de madeira clara, centrada no meio do bloco de mesas */}
      <mesh position={[-0.2, 0.65, -3.9]}>
        <boxGeometry args={[0.62, 1.3, 0.05]} />
        <meshStandardMaterial color={DESK_WOOD} />
      </mesh>
      <mesh position={[-0.42, 0.65, -3.87]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>

      {/* TV de parede — painel/dashboard da equipe, à esquerda do painel de destaque */}
      <mesh position={[-2.6, 1.05, -3.95]}>
        <boxGeometry args={[0.9, 0.52, 0.03]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      <mesh position={[-2.6, 1.05, -3.93]}>
        <boxGeometry args={[0.82, 0.44, 0.01]} />
        <meshStandardMaterial color="#0B1220" />
      </mesh>
      <mesh position={[-2.75, 0.98, -3.925]}>
        <boxGeometry args={[0.42, 0.05, 0.005]} />
        <meshStandardMaterial color={EMERALD_SCALE[500]} emissive={EMERALD_SCALE[500]} emissiveIntensity={0.6} />
      </mesh>

      {/* canto de decoração — bebedouro + prateleira com caixas de arquivo à direita */}
      <mesh position={[3.15, 0.55, -3.6]}>
        <boxGeometry args={[0.32, 1.1, 0.32]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {[0.35, 0.65, 0.95].map((y, i) => (
        <group key={i}>
          <mesh position={[3.15, y, -3.6]}>
            <boxGeometry args={[0.3, 0.02, 0.3]} />
            <meshStandardMaterial color={DESK_WOOD} />
          </mesh>
          <mesh position={[3.15 + (i % 2 === 0 ? -0.06 : 0.05), y + 0.06, -3.6]}>
            <boxGeometry args={[0.12, 0.09, 0.16]} />
            <meshStandardMaterial color={CAIXA_ARQUIVO_CORES[i % CAIXA_ARQUIVO_CORES.length]} />
          </mesh>
        </group>
      ))}
      <mesh position={[2.55, 0.32, -3.6]}>
        <cylinderGeometry args={[0.14, 0.16, 0.5, 12]} />
        <meshStandardMaterial color={CLOCK_FACE} />
      </mesh>
      <mesh position={[2.55, 0.68, -3.6]}>
        <cylinderGeometry args={[0.11, 0.11, 0.32, 12]} />
        <meshStandardMaterial color={PRIMARY_ACTION_BLUE_HEX} transparent opacity={0.85} />
      </mesh>

      {/* relógio de parede, entre o painel de destaque e o canto do bebedouro */}
      <group position={[1.4, 1.1, -3.94]} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.16, 0.16, 0.025, 16]} />
          <meshStandardMaterial color={MONITOR_FRAME} />
        </mesh>
        <mesh position={[0, 0, 0.015]}>
          <cylinderGeometry args={[0.13, 0.13, 0.02, 16]} />
          <meshStandardMaterial color={CLOCK_FACE} />
        </mesh>
      </group>

      {/* armário baixo de madeira, no canto esquerdo */}
      <RoundedBox args={[0.9, 0.55, 0.4]} radius={0.03} position={[-3.3, 0.28, -3.55]}>
        <meshStandardMaterial color={DESK_WOOD} />
      </RoundedBox>
      <mesh position={[-3.3, 0.28, -3.36]}>
        <boxGeometry args={[0.86, 0.48, 0.02]} />
        <meshStandardMaterial color={CABINET_DARK} />
      </mesh>
    </group>
  );
}

/** Divisória de vidro com moldura preta + reforço diagonal (estilo industrial/loft),
 * separando visualmente o open plan da sala de reunião sem fechar a passagem. */
function DivisoriaVidro() {
  const h = 1.8;
  const depth = 3;
  const diagLen = Math.sqrt(h * h + depth * depth);
  const diagAngle = Math.atan2(depth, h);
  return (
    <group position={[4.7, 0, -2.3]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[0.05, h, depth]} />
        <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.2} roughness={0.1} metalness={0.15} />
      </mesh>
      {[-depth / 2, depth / 2].map((pz, i) => (
        <mesh key={i} position={[0, h / 2, pz]}>
          <boxGeometry args={[0.07, h, 0.07]} />
          <meshStandardMaterial color={MONITOR_FRAME} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]}>
        <boxGeometry args={[0.07, 0.07, depth]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.07, 0.07, depth]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      <mesh position={[0, h / 2, 0]} rotation={[diagAngle, 0, 0]}>
        <boxGeometry args={[0.045, diagLen, 0.045]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
    </group>
  );
}

/** Quadro branco na parede lateral esquerda, entre a mesa principal e o armário — item
 * da referência (sala de reunião com quadro branco atrás das pessoas), moldura preta fina
 * + bandeja de marcador embaixo. */
function QuadroBranco() {
  return (
    <group position={[-3.83, 1.0, -1.2]}>
      <mesh>
        <boxGeometry args={[0.03, 0.75, 1.1]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[0.01, 0.65, 1.0]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0.03, -0.4, 0]}>
        <boxGeometry args={[0.04, 0.04, 1.0]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
    </group>
  );
}

const BALCAO_SEGMENTOS: number = 7;
const BALCAO_RAIO = 0.85;
const BALCAO_ANGULO_TOTAL = Math.PI * 0.85;

/** Balcão de recepção curvo — item marcante da referência, perto da entrada/corredor da
 * sala de reunião. Curva simulada com segmentos retos em leque (técnica baixo-poli
 * confiável) em vez de cilindro aberto — o cilindro oco virou uma silhueta fina/quebrada
 * dependendo do ângulo de câmera, os segmentos sempre leem como um móvel sólido. */
function BalcaoRecepcao() {
  const larguraSegmento = (BALCAO_RAIO * BALCAO_ANGULO_TOTAL) / BALCAO_SEGMENTOS + 0.03;
  return (
    <group position={[3.0, 0, -4.7]}>
      {Array.from({ length: BALCAO_SEGMENTOS }).map((_, i) => {
        const t = BALCAO_SEGMENTOS === 1 ? 0.5 : i / (BALCAO_SEGMENTOS - 1);
        const angulo = -BALCAO_ANGULO_TOTAL / 2 + t * BALCAO_ANGULO_TOTAL;
        const x = Math.sin(angulo) * BALCAO_RAIO;
        const z = Math.cos(angulo) * BALCAO_RAIO;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, angulo, 0]}>
            <RoundedBox args={[larguraSegmento, 0.8, 0.28]} radius={0.03} position={[0, 0.4, 0]}>
              <meshStandardMaterial color="#2B2E33" />
            </RoundedBox>
            <RoundedBox args={[larguraSegmento + 0.05, 0.06, 0.34]} radius={0.02} position={[0, 0.83, 0]}>
              <meshStandardMaterial color={DESK_WOOD} />
            </RoundedBox>
          </group>
        );
      })}
      <group position={[0, 0.9, BALCAO_RAIO * 0.5]}>
        <mesh>
          <boxGeometry args={[0.28, 0.2, 0.02]} />
          <meshStandardMaterial color={MONITOR_FRAME} />
        </mesh>
        <mesh position={[0, 0, 0.012]}>
          <boxGeometry args={[0.24, 0.16, 0.01]} />
          <meshStandardMaterial
            color={EMERALD_SCALE[400]}
            emissive={EMERALD_SCALE[400]}
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>
    </group>
  );
}

function Chao() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[20, 11]} />
      <meshStandardMaterial color={FLOOR_COLOR} />
    </mesh>
  );
}

function CenaGirando({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const visivelRef = useRef(true);

  useEffect(() => {
    const onVisibility = () => {
      visivelRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useFrame((_, delta) => {
    if (ref.current && visivelRef.current) ref.current.rotation.y += delta * 0.02;
  });
  return <group ref={ref}>{children}</group>;
}

/** As últimas atividades reais decidem quem está "na sala de reunião" agora — reaproveita
 * o mesmo feed que já alimenta o rodapé "ao vivo" da cena, em vez de a sala ficar sempre
 * vazia/decorativa. No máximo 1 assento por gestor (a atividade mais recente dele). */
function calcularAgentesEmReuniao(atividades: AtividadeAoVivo[]): AgenteReuniao[] {
  const vistos = new Set<string>();
  const agentes: AgenteReuniao[] = [];
  for (const a of atividades) {
    const nome = NOME_POR_GESTOR[a.gestor];
    if (vistos.has(nome)) continue;
    const estacao = ESTACOES.find((e) => e.nome === nome);
    if (!estacao) continue;
    vistos.add(nome);
    agentes.push({ nome, corTerno: estacao.corTerno ?? SUIT_NEUTRAL, texto: a.texto, tom: a.tom });
    if (agentes.length >= CADEIRAS_FRENTE_X.length) break;
  }
  return agentes;
}

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
  const agentesReuniao = calcularAgentesEmReuniao(atividades);

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

      <div className="relative mt-3 w-full" style={{ aspectRatio: "16 / 9", background: FLOOR_COLOR }}>
        <Canvas dpr={[1, 1.5]} gl={{ powerPreference: "low-power" }} camera={{ position: [5, 7, 10], fov: 40 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[8, 12, 6]} intensity={1.1} />
          <CenaGirando>
            <Chao />
            <ParedeFundo />
            <QuadroBranco />
            <BalcaoRecepcao />
            <AreaPrincipal />
            <DivisoriaVidro />
            <SalaReuniao agentes={agentesReuniao} />
            <SalaTiagoSilva />
            <SalaJogos />
          </CenaGirando>
          <OrbitControls
            enablePan
            enableZoom
            minDistance={6.5}
            maxDistance={14}
            maxPolarAngle={Math.PI / 2.1}
            target={[-2, 0.5, 0]}
          />
        </Canvas>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="mt-2 text-[11px] text-[var(--muted)]">Arraste pra girar e ver as outras salas.</p>
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
