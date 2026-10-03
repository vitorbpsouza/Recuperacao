import {
  CarFrontIcon,
  FileWarningIcon,
  LockIcon,
  MapPinIcon,
  PhoneIcon,
  RadarIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';

import {
  camposNovos,
  PAPEIS_DO_DOSSIE,
  papeisDaPessoa,
  placasEquivalentes,
  type LeituraDeRelatorio,
  type PapelDoDossie,
  type PessoaLida,
} from '@workspace/domain';
import { Rotulo } from '@workspace/ui/brand/rotulo';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { cn } from '@workspace/ui/lib/utils';

import { Mapa } from '@/components/mapa.tsx';
import {
  CAMPOS_DO_VEICULO,
  enderecoEmLinha,
  formatarDocumento,
  formatarNascimento,
  formatarTelefone,
  ROTULO_PAPEL,
  ROTULO_TIPO_CONTATO,
} from '@/lib/pessoa.ts';

/** Bloco da prévia: ícone, título, contagem e conteúdo. */
export function Bloco({
  icone: Icone,
  titulo,
  contagem,
  tom = 'azul',
  children,
  className,
}: {
  icone: typeof CarFrontIcon;
  titulo: string;
  contagem?: string | number;
  tom?: 'azul' | 'verde' | 'ambar' | 'violeta' | 'cinza';
  children: ReactNode;
  className?: string;
}) {
  const cores = {
    azul: 'bg-blue-500/10 text-blue-300',
    verde: 'bg-emerald-500/10 text-emerald-300',
    ambar: 'bg-amber-500/10 text-amber-300',
    violeta: 'bg-violet-500/10 text-violet-300',
    cinza: 'bg-slate-500/10 text-slate-300',
  };
  return (
    <section className={cn('rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]', className)}>
      <header className="mb-3 flex items-center gap-2">
        <span className={cn('flex size-7 items-center justify-center rounded-lg', cores[tom])}>
          <Icone className="size-4" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold text-white">{titulo}</h3>
        {contagem !== undefined ? (
          <Badge variant="outline" className="ml-auto tabular-nums">
            {contagem}
          </Badge>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function Campo({ rotulo, valor, mono }: { rotulo: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <Rotulo className="text-[10px]">{rotulo}</Rotulo>
      <p className={cn('truncate text-sm text-white', mono && 'font-mono text-xs')}>{valor}</p>
    </div>
  );
}

const simNao = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'Sim' : 'Não');

/** Papel de cada pessoa lida: decidido pelo documento, ou escolhido aqui. */
export function usePapeis(leitura: LeituraDeRelatorio | null, devedorDoc: string | null | undefined) {
  return useMemo(
    () => (leitura?.pessoas ?? []).map((p) => ({ pessoa: p, ...papeisDaPessoa(p, devedorDoc) })),
    [leitura, devedorDoc],
  );
}

function CartaoPessoa({
  pessoa,
  papeis,
  pergunta,
  papelEscolhido,
  aoEscolher,
  sensivelVisivel,
}: {
  pessoa: PessoaLida;
  papeis: string[];
  pergunta: boolean;
  papelEscolhido?: PapelDoDossie;
  aoEscolher: (p: PapelDoDossie) => void;
  sensivelVisivel: boolean;
}) {
  const sensiveis = pessoa.extras.filter((e) => e.sensivel);
  const celulares = pessoa.contatos.filter((c) => c.tipo === 'celular').length;
  const fixos = pessoa.contatos.filter((c) => c.tipo === 'fixo').length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-white">{pessoa.nome ?? 'Sem nome'}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatarDocumento(pessoa.documento)}
            {pessoa.origem === 'proprietario_do_veiculo' ? ' · proprietário no relatório do veículo' : ' · dossiê'}
          </p>
        </div>
        {pergunta ? (
          <div className="w-full sm:w-64">
            <Select value={papelEscolhido ?? ''} onValueChange={(v) => aoEscolher(v as PapelDoDossie)}>
              <SelectTrigger className={cn('w-full', !papelEscolhido && 'ring-2 ring-amber-400/60')} aria-label="Papel da pessoa no caso">
                <SelectValue placeholder="Qual o papel desta pessoa?" />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS_DO_DOSSIE.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROTULO_PAPEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-amber-300">O documento não é o do devedor do caso: diga quem é.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {papeis.map((p) => (
              <Badge key={p} className="bg-blue-500/15 text-blue-200">
                {ROTULO_PAPEL[p as keyof typeof ROTULO_PAPEL]}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {pessoa.obito ? (
        <Alert variant="destructive">
          <FileWarningIcon />
          <AlertTitle>Registro de óbito</AlertTitle>
          <AlertDescription>Devedor falecido: o polo passivo passa a ser o espólio.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
        {pessoa.nomeMae ? <Campo rotulo="Mãe" valor={pessoa.nomeMae} /> : null}
        {pessoa.nomePai ? <Campo rotulo="Pai" valor={pessoa.nomePai} /> : null}
        {pessoa.nascimento ? <Campo rotulo="Nascimento" valor={formatarNascimento(pessoa.nascimento)} /> : null}
        {pessoa.sexo ? <Campo rotulo="Sexo" valor={pessoa.sexo} /> : null}
        {pessoa.profissao ? <Campo rotulo="Profissão" valor={pessoa.profissao} /> : null}
        {pessoa.situacaoCadastral ? <Campo rotulo="Situação cadastral" valor={pessoa.situacaoCadastral} /> : null}
        {pessoa.obito === false ? <Campo rotulo="Óbito" valor="Não consta" /> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <PhoneIcon className="size-3.5" aria-hidden />
            Contatos · {celulares} celular(es), {fixos} fixo(s)
          </p>
          <ul className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto pr-1">
            {pessoa.contatos.map((c) => (
              <li key={`${c.tipo}${c.valor}`} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5 text-xs">
                <span className={cn('w-14 shrink-0', c.valido ? 'text-slate-400' : 'text-red-300')}>{ROTULO_TIPO_CONTATO[c.tipo]}</span>
                <span className={cn('font-mono tabular-nums', c.valido ? 'text-white' : 'text-red-300 line-through')}>
                  {c.tipo === 'email' ? c.valor : formatarTelefone(c.valor)}
                </span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground" title={c.fontes.map((f) => f.fonte).join(', ')}>
                  {c.fontes.length} fonte{c.fontes.length > 1 ? 's' : ''}
                </span>
              </li>
            ))}
            {!pessoa.contatos.length ? <li className="text-xs text-muted-foreground">Nenhum contato no texto.</li> : null}
          </ul>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <MapPinIcon className="size-3.5" aria-hidden />
            Endereços · {pessoa.enderecos.length}
          </p>
          <ul className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto pr-1">
            {pessoa.enderecos.map((e) => (
              <li key={e.chave} className="rounded-md bg-white/[0.03] px-2 py-1.5 text-xs">
                <p className="text-white">{enderecoEmLinha(e)}</p>
                {e.variantes.length > 1 ? (
                  <p className="text-[11px] text-muted-foreground">{e.variantes.length} grafias juntadas</p>
                ) : null}
              </li>
            ))}
            {!pessoa.enderecos.length ? <li className="text-xs text-muted-foreground">Nenhum endereço no texto.</li> : null}
          </ul>
        </div>
      </div>

      {pessoa.parentes.length || sensiveis.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-500/[0.06] p-3 text-xs text-violet-200 ring-1 ring-violet-400/15">
          <LockIcon className="size-3.5" aria-hidden />
          <span>
            {pessoa.parentes.length} parente(s) e {sensiveis.length} dado(s) de perfil, crédito e IRPF serão guardados.{' '}
            {sensivelVisivel ? 'Você poderá vê-los na ficha.' : 'Só admin e gestor os veem, com registro de acesso.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export interface PreviaProps {
  leitura: LeituraDeRelatorio;
  devedorDoc?: string | null;
  papelEscolhido?: PapelDoDossie;
  aoEscolherPapel: (p: PapelDoDossie) => void;
  sensivelVisivel: boolean;
  /** Placa do caso: avisa quando o texto é de outra. */
  placaDoCaso?: string;
  /** Plano B não registra radar como avistamento. */
  planoA: boolean;
}

/** Tudo o que o texto colado vai gravar, antes de gravar. */
export function PreviaLeitura({ leitura, devedorDoc, papelEscolhido, aoEscolherPapel, sensivelVisivel, placaDoCaso, planoA }: PreviaProps) {
  const papeis = usePapeis(leitura, devedorDoc);
  const novos = camposNovos(leitura);
  const v = leitura.veiculo;
  const outraPlaca = !!placaDoCaso && !!v?.placa && !placasEquivalentes(v.placa, placaDoCaso);
  const outraGrafia = !!placaDoCaso && !!v?.placa && !outraPlaca && v.placa !== placaDoCaso;
  const radares = leitura.radares.filter((r) => !placaDoCaso || !r.placa || placasEquivalentes(r.placa, placaDoCaso));
  const pontos = useMemo(
    () =>
      radares
        .filter((r) => r.latitude !== undefined && r.longitude !== undefined)
        .sort((a, b) => a.observadoEm.localeCompare(b.observadoEm))
        .map((r, i) => ({
          id: i,
          latitude: r.latitude!,
          longitude: r.longitude!,
          cor: '#a78bfa',
          titulo: new Date(r.observadoEm).toLocaleString('pt-BR'),
          linhas: [r.local],
        })),
    [radares],
  );
  const vazio = !v && !leitura.pessoas.length && !leitura.radares.length && !leitura.outros.length;

  if (vazio) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 p-8 text-center">
        <SparklesIcon className="size-6 text-slate-500" aria-hidden />
        <p className="text-sm text-muted-foreground">Nada reconhecido ainda. Cole o relatório do veículo, o radar ou o dossiê da pessoa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {leitura.secoes.map((s, i) => (
          <Badge key={`${s}${i}`} variant="outline" className="text-[11px] text-slate-300">
            {s}
          </Badge>
        ))}
      </div>

      {outraPlaca ? (
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertTitle>Texto de outra placa</AlertTitle>
          <AlertDescription>
            O relatório é da placa {v?.placa}, e o caso é da {placaDoCaso}. Ele não será gravado neste caso.
          </AlertDescription>
        </Alert>
      ) : null}

      {outraGrafia ? (
        <Alert>
          <CarFrontIcon />
          <AlertTitle>Mesma placa, outro padrão</AlertTitle>
          <AlertDescription>
            {v?.placa} e {placaDoCaso} são a mesma placa (antiga e Mercosul: o segundo número vira letra). O texto será gravado neste caso.
          </AlertDescription>
        </Alert>
      ) : null}

      {v ? (
        <Bloco icone={CarFrontIcon} titulo="Veículo" contagem={`${CAMPOS_DO_VEICULO.filter(([k]) => v[k] !== undefined).length} campos`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 2xl:grid-cols-4">
            {CAMPOS_DO_VEICULO.filter(([k]) => v[k] !== undefined).map(([k, rotulo]) => (
              <Campo key={k} rotulo={rotulo} valor={String(v[k])} mono={k === 'chassi' || k === 'renavam'} />
            ))}
            {(['renajud', 'rouboFurto', 'leilao', 'alienacaoFiduciaria'] as const)
              .filter((k) => v[k] !== undefined)
              .map((k) => (
                <Campo
                  key={k}
                  rotulo={{ renajud: 'RENAJUD', rouboFurto: 'Roubo/furto', leilao: 'Leilão', alienacaoFiduciaria: 'Alienação fiduciária' }[k]}
                  valor={<span className={v[k] && k !== 'alienacaoFiduciaria' ? 'text-red-300' : ''}>{simNao(v[k])}</span>}
                />
              ))}
          </div>
          {v.restricoes.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.restricoes.map((r) => (
                <Badge key={r} className="bg-red-500/15 text-red-200">
                  {r}
                </Badge>
              ))}
            </div>
          ) : null}
        </Bloco>
      ) : null}

      {papeis.map(({ pessoa, papeis: decididos, pergunta }, i) => (
        <Bloco
          key={`${pessoa.documento ?? pessoa.nome}${i}`}
          icone={pessoa.origem === 'proprietario_do_veiculo' ? UserRoundIcon : UsersIcon}
          titulo={pessoa.origem === 'proprietario_do_veiculo' ? 'Proprietário' : 'Pessoa'}
          tom="verde"
        >
          <CartaoPessoa
            pessoa={pessoa}
            papeis={decididos}
            pergunta={pergunta}
            papelEscolhido={papelEscolhido}
            aoEscolher={aoEscolherPapel}
            sensivelVisivel={sensivelVisivel}
          />
        </Bloco>
      ))}

      {radares.length ? (
        <Bloco icone={RadarIcon} titulo="Passagens por radar" contagem={radares.length} tom="violeta">
          {pontos.length ? <Mapa pontos={pontos} ligarPontos className="mb-3 h-64" /> : null}
          <ul className="space-y-1 text-xs">
            {radares.map((r) => (
              <li key={`${r.observadoEm}${r.local}`} className="flex gap-3 rounded-md bg-white/[0.03] px-2 py-1.5">
                <span className="shrink-0 text-slate-400 tabular-nums">{new Date(r.observadoEm).toLocaleString('pt-BR')}</span>
                <span className="truncate text-white">{r.local}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {planoA ? 'Cada passagem vira um avistamento no mapa do caso.' : 'No Plano B o radar fica guardado no caso, sem virar avistamento.'}
          </p>
        </Bloco>
      ) : null}

      {novos.length ? (
        <Bloco icone={SparklesIcon} titulo="Campos novos" contagem={novos.length} tom="ambar">
          <p className="mb-2 text-xs text-amber-200">
            Rótulos que o sistema ainda não conhecia. Viram campo na hora: aparecem na ficha, nos relatórios e no CSV. Dá para renomear,
            juntar ou ocultar em Gestão › Campos dos relatórios.
          </p>
          <ul className="grid gap-1 text-xs md:grid-cols-2">
            {novos.map((n) => (
              <li key={n.chave + n.valor} className="truncate rounded-md bg-amber-500/[0.06] px-2 py-1.5">
                <span className="text-amber-300">{n.rotulo}</span>
                <span className="text-slate-400"> · {n.secao}</span>
                {!n.sensivel ? <span className="text-white"> = {n.valor}</span> : null}
              </li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      {leitura.avisos.length ? (
        <Alert>
          <FileWarningIcon />
          <AlertTitle>Para conferir</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {leitura.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** O papel ainda não escolhido trava o envio. */
export const faltaPapel = (leitura: LeituraDeRelatorio | null, devedorDoc: string | null | undefined, papel?: PapelDoDossie) =>
  !!leitura && leitura.pessoas.some((p) => papeisDaPessoa(p, devedorDoc).pergunta) && !papel;
