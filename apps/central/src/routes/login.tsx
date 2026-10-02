import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { AlertCircleIcon, LockIcon, MailIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { definirCsrf } from '@workspace/api-client';
import { loginEntrada } from '@workspace/domain';
import { TenantMark } from '@workspace/ui/brand/tenant-mark';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent } from '@workspace/ui/components/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@workspace/ui/components/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@workspace/ui/components/input-group';
import { Spinner } from '@workspace/ui/components/spinner';

import { api, ErroApi, sessaoQuery } from '@/lib/api.ts';
import { MARCA_PADRAO } from '@/lib/marca.ts';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ voltar: z.string().optional() }),
  // Quem já tem sessão não vê o login.
  beforeLoad: async ({ context }) => {
    const sessao = await context.queryClient.ensureQueryData(sessaoQuery);
    if (sessao) throw redirect({ to: '/' });
  },
  component: Login,
});

type Credenciais = z.infer<typeof loginEntrada>;

function Login() {
  const { voltar } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<Credenciais>({ resolver: zodResolver(loginEntrada), defaultValues: { email: '', senha: '' } });

  const entrar = useMutation({
    mutationFn: async (credenciais: Credenciais) => {
      const { data, response } = await api.POST('/api/auth/login', { body: credenciais });
      if (!data) throw new ErroApi(response.status, 'falha no login');
      return data;
    },
    onSuccess: async ({ usuario }) => {
      definirCsrf(usuario.csrfToken);
      queryClient.setQueryData(sessaoQuery.queryKey, usuario);
      await navigate({ to: voltar ?? '/' });
    },
  });

  // O servidor não distingue senha errada de usuário inexistente, e a tela
  // não deve inventar essa distinção.
  const mensagemErro = entrar.error
    ? entrar.error instanceof ErroApi && entrar.error.status === 401
      ? 'E-mail ou senha incorretos.'
      : entrar.error instanceof ErroApi && entrar.error.status === 429
        ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
        : 'Não foi possível entrar. Verifique se a API está no ar.'
    : null;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm animate-in duration-300 fade-in slide-in-from-bottom-2">
        <div className="mb-8 flex flex-col items-center gap-3">
          <TenantMark sigla={MARCA_PADRAO.sigla} nome={MARCA_PADRAO.nome} tamanho="lg" />
          <h1 className="text-xl font-bold tracking-tight text-white">{MARCA_PADRAO.nome}</h1>
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Recuperação e aquisição de veículos
          </p>
        </div>

        <Card className="py-6">
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => entrar.mutate(v))} noValidate>
              <FieldGroup>
                <Field data-invalid={!!form.formState.errors.email}>
                  <FieldLabel htmlFor="email">E-mail</FieldLabel>
                  <InputGroup className="h-10">
                    <InputGroupAddon>
                      <MailIcon aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="email"
                      type="email"
                      autoComplete="username"
                      placeholder="voce@dominio.com"
                      aria-invalid={!!form.formState.errors.email}
                      {...form.register('email')}
                    />
                  </InputGroup>
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.senha}>
                  <FieldLabel htmlFor="senha">Senha</FieldLabel>
                  <InputGroup className="h-10">
                    <InputGroupAddon>
                      <LockIcon aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="senha"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      aria-invalid={!!form.formState.errors.senha}
                      {...form.register('senha')}
                    />
                  </InputGroup>
                  <FieldError errors={[form.formState.errors.senha]} />
                </Field>

                {mensagemErro ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertDescription>{mensagemErro}</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" size="lg" className="h-10 w-full" disabled={entrar.isPending}>
                  {entrar.isPending ? <Spinner /> : null}
                  {entrar.isPending ? 'Entrando…' : 'Entrar'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Acesso restrito. Toda consulta realizada é registrada
          <br />
          em trilha de auditoria vinculada ao seu usuário.
        </p>
      </div>
    </main>
  );
}
