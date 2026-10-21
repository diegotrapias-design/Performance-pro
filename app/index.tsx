
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

const C = {
  bg: '#111114',
  panel: '#1c1c21',
  panel2: '#29292f',
  line: '#44444b',
  text: '#f8f8f8',
  muted: '#b7b7bd',
  red: '#c92532',
  silver: '#c9cbd0',
  green: '#83d6a3',
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'coach' | 'athlete';
  team_id: string | null;
};

type Athlete = {
  id: string;
  full_name: string;
  email: string | null;
  sport: string | null;
  category?: string | null;
  position?: string | null;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [tab, setTab] = useState('Início');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [sport, setSport] = useState('Futebol');
  const [psr, setPsr] = useState('18');
  const [pse, setPse] = useState('7');
  const [duration, setDuration] = useState('60');
  const [jumpPre, setJumpPre] = useState('');
  const [jumpPost, setJumpPost] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;

        if (error) setLoginError(error.message);

        setSession(data.session);

        if (data.session) {
          void loadProfile(data.session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoginError(errorMessage(error));
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      setSession(nextSession);

      if (nextSession) {
        setLoginError('');
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setAthletes([]);
        setSessions([]);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(id: string) {
    if (!supabase) return;

    setLoading(true);
    setActionError('');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,role,team_id')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        setProfile(null);
        setActionError(`Erro ao carregar perfil: ${error.message}`);
        return;
      }

      if (!data) {
        setProfile(null);
        setActionError(
          'Login realizado, mas não foi encontrado um perfil para esta conta. Peça ao treinador para conferir seu cadastro.'
        );
        return;
      }

      if (data.role !== 'coach' && data.role !== 'athlete') {
        setProfile(null);
        setActionError(
          'A função da conta não está configurada como treinador ou atleta.'
        );
        return;
      }

      const loadedProfile = data as Profile;
      setProfile(loadedProfile);

      if (loadedProfile.role === 'coach') {
        await loadAthletes(loadedProfile);
      } else {
        const { data: linked, error: linkedError } = await supabase
          .from('athletes')
          .select('id')
          .eq('user_id', id)
          .maybeSingle();

        if (linkedError) {
          setActionError(`Erro ao carregar vínculo: ${linkedError.message}`);
        } else if (linked) {
          setSelectedAthlete(linked.id);
          await loadMonitoring(linked.id);
        }
      }
    } catch (error: unknown) {
      setActionError(`Erro ao carregar perfil: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadAthletes(p = profile) {
    if (!supabase || !p || p.role !== 'coach') return;

    try {
      const { data, error } = await supabase
        .from('athletes')
        .select('id,full_name,email,sport,category,position')
        .order('full_name');

      if (error) {
        setActionError(`Erro ao carregar atletas: ${error.message}`);
        return;
      }

      const rows = (data || []) as Athlete[];
      setAthletes(rows);

      if (!selectedAthlete && rows[0]) {
        setSelectedAthlete(rows[0].id);
      }
    } catch (error: unknown) {
      setActionError(`Erro ao carregar atletas: ${errorMessage(error)}`);
    }
  }

  async function loadMonitoring(athleteId: string) {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('monitoring_sessions')
        .select(
          'id,session_date,psr,pse,duration_min,load_ua,jump_pre_cm,jump_post_cm'
        )
        .eq('athlete_id', athleteId)
        .order('session_date', { ascending: false })
        .limit(30);

      if (error) {
        setActionError(`Erro no monitoramento: ${error.message}`);
      } else {
        setSessions(data || []);
      }
    } catch (error: unknown) {
      setActionError(`Erro no monitoramento: ${errorMessage(error)}`);
    }
  }

  async function authenticate() {
    setLoginError('');

    if (!supabase) {
      setLoginError(
        'Supabase não configurado. Confira as variáveis de ambiente na hospedagem.'
      );
      return;
    }

    if (!email.trim() || !password) {
      setLoginError('Informe seu e-mail e sua senha.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoginError(`Não foi possível entrar: ${error.message}`);
        return;
      }

      if (!data.session) {
        setLoginError(
          'O login não retornou uma sessão. Confira seus dados e tente novamente.'
        );
      }
    } catch (error: unknown) {
      setLoginError(`Falha ao tentar entrar: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function completeInvite() {
    if (!supabase || newPassword.length < 8) {
      Alert.alert(
        'Senha inválida',
        'Crie uma senha com pelo menos 8 caracteres.'
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { invitation_pending: false },
      });

      if (error) {
        Alert.alert('Não foi possível definir a senha', error.message);
      } else {
        setNewPassword('');
        Alert.alert(
          'Acesso ativado',
          'Sua senha foi criada. Bem-vindo ao Performance Pro.'
        );
      }
    } catch (error: unknown) {
      Alert.alert('Erro', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function inviteAthlete() {
    if (!supabase || !name.trim() || !inviteEmail.trim()) {
      Alert.alert(
        'Dados obrigatórios',
        'Informe o nome e o e-mail do atleta.'
      );
      return;
    }

    setSendingInvite(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        'invite-athlete',
        {
          body: {
            full_name: name.trim(),
            email: inviteEmail.trim(),
            sport,
          },
        }
      );

      if (error || data?.error) {
        Alert.alert(
          'Convite não enviado',
          data?.error || error?.message || 'Tente novamente.'
        );
        return;
      }

      const invitedAddress = inviteEmail.trim();
      setName('');
      setInviteEmail('');

      Alert.alert(
        'Convite enviado',
        `Um convite para criar senha foi enviado para ${invitedAddress}.`
      );

      await loadAthletes();
    } catch (error: unknown) {
      Alert.alert('Convite não enviado', errorMessage(error));
    } finally {
      setSendingInvite(false);
    }
  }

  async function saveSession() {
    if (!supabase || !selectedAthlete || !session?.user?.id) {
      Alert.alert(
        'Selecione um atleta',
        'Escolha o atleta para registrar a sessão.'
      );
      return;
    }

    const nPsr = psr.trim() === '' ? null : Number(psr);
    const nPse = pse.trim() === '' ? null : Number(pse);
    const nDuration = duration.trim() === '' ? null : Number(duration);
    const nJumpPre = jumpPre.trim() === '' ? null : Number(jumpPre);
    const nJumpPost = jumpPost.trim() === '' ? null : Number(jumpPost);

    if (
      (nPsr !== null &&
        (!Number.isFinite(nPsr) || nPsr < 0 || nPsr > 20)) ||
      (nPse !== null &&
        (!Number.isFinite(nPse) || nPse < 0 || nPse > 10)) ||
      (nDuration !== null &&
        (!Number.isFinite(nDuration) ||
          nDuration < 0 ||
          nDuration > 1440)) ||
      (nJumpPre !== null &&
        (!Number.isFinite(nJumpPre) || nJumpPre < 0)) ||
      (nJumpPost !== null &&
        (!Number.isFinite(nJumpPost) || nJumpPost < 0))
    ) {
      Alert.alert(
        'Valores inválidos',
        'Confira PSR (0–20), PSE (0–10), duração e valores dos saltos.'
      );
      return;
    }

    const payload = {
      athlete_id: selectedAthlete,
      session_date: new Date().toISOString().slice(0, 10),
      psr: nPsr,
      pse: nPse,
      duration_min: nDuration,
      jump_pre_cm: nJumpPre,
      jump_post_cm: nJumpPost,
      created_by: session.user.id,
    };

    try {
      const { error } = await supabase
        .from('monitoring_sessions')
        .insert(payload);

      if (error) {
        Alert.alert('Registro não salvo', error.message);
      } else {
        Alert.alert('Registro salvo', 'Monitoramento salvo com sucesso.');
        setJumpPre('');
        setJumpPost('');
        await loadMonitoring(selectedAthlete);
      }
    } catch (error: unknown) {
      Alert.alert('Registro não salvo', errorMessage(error));
    }
  }

  async function updateName() {
    if (!supabase || !profile) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: profile.full_name })
        .eq('id', profile.id);

      if (error) {
        Alert.alert('Perfil', error.message);
      } else {
        Alert.alert('Perfil atualizado', 'Nome salvo.');
      }
    } catch (error: unknown) {
      Alert.alert('Perfil', errorMessage(error));
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.red} />
        <Text style={s.muted}>Carregando Performance Pro…</Text>
      </View>
    );
  }

  if (session?.user?.user_metadata?.invitation_pending) {
    return (
      <ScrollView contentContainerStyle={s.login}>
        <Image
          source={require('../logo-diego-trapia.jpg')}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.eyebrow}>CONVITE DE ATLETA</Text>
        <Text style={s.title}>Crie sua senha</Text>
        <Text style={s.muted}>
          Seu treinador convidou você para o Performance Pro. Defina uma senha
          pessoal para concluir o acesso.
        </Text>
        <TextInput
          style={s.input}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Nova senha (mínimo 8 caracteres)"
          placeholderTextColor={C.muted}
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <Pressable
          style={s.primary}
          onPress={() => void completeInvite()}
          disabled={loading}
        >
          <Text style={s.primaryText}>Definir senha e continuar</Text>
        </Pressable>
        <Text style={s.legal}>
          Não compartilhe sua senha. Seus dados e sua evolução ficam restritos
          ao seu perfil e aos profissionais autorizados.
        </Text>
      </ScrollView>
    );
  }

  if (!session) {
    return (
      <ScrollView
        contentContainerStyle={s.login}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require('../logo-diego-trapia.jpg')}
          style={s.logo}
          resizeMode="contain"
        />

        <Text style={s.eyebrow}>PLATAFORMA DE ALTA PERFORMANCE</Text>
        <Text style={s.title}>Seu próximo nível começa aqui.</Text>
        <Text style={s.muted}>
          Treinamento, monitoramento e evolução em um só lugar.
        </Text>

        {!supabase && (
          <Text style={s.warning}>
            Configure as variáveis Supabase na hospedagem para ativar o login.
          </Text>
        )}

        <TextInput
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="E-mail"
          placeholderTextColor={C.muted}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setLoginError('');
          }}
        />

        <TextInput
          style={s.input}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Senha"
          placeholderTextColor={C.muted}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setLoginError('');
          }}
          onSubmitEditing={() => {
            if (!loading) void authenticate();
          }}
          returnKeyType="go"
        />

        {loginError !== '' && (
          <Text accessibilityRole="alert" style={s.warning}>
            {loginError}
          </Text>
        )}

        <Pressable
          style={[s.primary, loading && s.primaryDisabled]}
          onPress={() => {
            if (!loading) void authenticate();
          }}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={s.primaryText}>
            {loading ? 'Entrando…' : 'Entrar na plataforma'}
          </Text>
        </Pressable>

        <Text style={s.legal}>
          Acesso por convite. O treinador cria seu cadastro e envia um link
          seguro para você definir a senha. O cadastro público está desativado.
        </Text>
      </ScrollView>
    );
  }

  const isCoach = profile?.role === 'coach';

  return (
    <View style={s.shell}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>
            PERFORMANCE <Text style={{ color: C.red }}>PRO</Text>
          </Text>
          <Text style={s.muted}>DIEGO TRAPIÁ • ALTA PERFORMANCE</Text>
        </View>
        <Pressable onPress={() => void supabase?.auth.signOut()}>
          <Text style={s.link}>Sair</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {actionError !== '' && (
          <Text accessibilityRole="alert" style={s.warning}>
            {actionError}
          </Text>
        )}

        <Text style={s.eyebrow}>
          {isCoach ? 'PAINEL DO TREINADOR' : 'ÁREA DO ATLETA'}
        </Text>
        <Text style={s.title}>
          Olá,{' '}
          {profile?.full_name ||
            session.user.email?.split('@')[0] ||
            'usuário'}
          .
        </Text>
        <Text style={s.muted}>
          {isCoach
            ? 'Gerencie sua equipe com segurança.'
            : 'Consulte seus treinos e acompanhe somente seus próprios resultados.'}
        </Text>

        <View style={s.metrics}>
          <Metric
            label={isCoach ? 'Atletas na equipe' : 'Seu perfil'}
            value={isCoach ? String(athletes.length) : 'Atleta'}
          />
          <Metric
            label="Acesso"
            value={isCoach ? 'Treinador' : 'Individual'}
          />
        </View>

        <View style={s.nav}>
          {(isCoach
            ? ['Início', 'Atletas', 'Treinos', 'Biblioteca', 'Monitoramento']
            : ['Início', 'Meus treinos', 'Biblioteca', 'Minha evolução']
          ).map((item) => (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              style={[s.navItem, tab === item && s.navActive]}
            >
              <Text
                style={{
                  color: tab === item ? C.text : C.muted,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'Início' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {isCoach
                ? 'Centro de performance'
                : 'Seu espaço de performance'}
            </Text>
            <Text style={s.muted}>
              {isCoach
                ? 'Convide atletas, atribua treinos e acompanhe avaliações individuais.'
                : 'Aqui aparecem apenas os treinos atribuídos a você e seus próprios indicadores.'}
            </Text>
            <View style={s.actions}>
              {(isCoach
                ? ['Atletas', 'Treinos', 'Biblioteca', 'Monitoramento']
                : ['Meus treinos', 'Biblioteca', 'Minha evolução']
              ).map((item) => (
                <Pressable
                  key={item}
                  style={s.action}
                  onPress={() => setTab(item)}
                >
                  <Text style={s.actionText}>{item} →</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {tab === 'Atletas' && isCoach && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Convidar atleta</Text>
            <Text style={s.muted}>
              O atleta receberá um e-mail para criar sua senha individual.
            </Text>

            <TextInput
              style={s.input}
              placeholder="Nome completo"
              placeholderTextColor={C.muted}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={s.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="E-mail do atleta"
              placeholderTextColor={C.muted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
            />
            <TextInput
              style={s.input}
              placeholder="Modalidade"
              placeholderTextColor={C.muted}
              value={sport}
              onChangeText={setSport}
            />

            <Pressable
              style={[s.primary, sendingInvite && s.primaryDisabled]}
              onPress={() => void inviteAthlete()}
              disabled={sendingInvite}
            >
              <Text style={s.primaryText}>
                {sendingInvite ? 'Enviando convite…' : 'Enviar convite seguro'}
              </Text>
            </Pressable>

            <Text style={[s.cardTitle, { marginTop: 22 }]}>Minha equipe</Text>
            {athletes.map((athlete) => (
              <Pressable
                key={athlete.id}
                style={[
                  s.athlete,
                  selectedAthlete === athlete.id && s.selected,
                ]}
                onPress={() => {
                  setSelectedAthlete(athlete.id);
                  void loadMonitoring(athlete.id);
                }}
              >
                <Text style={s.athleteName}>{athlete.full_name}</Text>
                <Text style={s.muted}>
                  {athlete.email || 'E-mail não informado'} ·{' '}
                  {athlete.sport || 'Modalidade não informada'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {(tab === 'Treinos' || tab === 'Meus treinos') && (
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {isCoach ? 'Montagem de treinos' : 'Meus treinos atribuídos'}
            </Text>
            <Text style={s.muted}>
              {isCoach
                ? 'Próximo módulo: criar sessões por atleta com exercícios, séries, repetições, carga, descanso e calendário.'
                : 'Os treinos atribuídos a você aparecerão aqui. Você não tem acesso aos dados de outros atletas.'}
            </Text>
          </View>
        )}

        {tab === 'Biblioteca' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Biblioteca de exercícios</Text>
            <Text style={s.muted}>
              Próximo módulo: catálogo com exercícios pré-definidos, vídeos
              autorizados e opção de download offline.
            </Text>
          </View>
        )}

        {(tab === 'Monitoramento' || tab === 'Minha evolução') && (
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {isCoach ? 'Monitoramento da equipe' : 'Minha evolução'}
            </Text>
            <Text style={s.muted}>
              UA = PSE × duração em minutos. O atleta só consegue consultar
              seus próprios registros.
            </Text>

            {isCoach && (
              <>
                <Text style={s.label}>Atleta selecionado</Text>
                {athletes.map((athlete) => (
                  <Pressable
                    key={athlete.id}
                    onPress={() => {
                      setSelectedAthlete(athlete.id);
                      void loadMonitoring(athlete.id);
                    }}
                    style={[
                      s.athlete,
                      selectedAthlete === athlete.id && s.selected,
                    ]}
                  >
                    <Text style={s.athleteName}>{athlete.full_name}</Text>
                  </Pressable>
                ))}
              </>
            )}

            {isCoach && (
              <>
                <Text style={s.label}>PSR/TQR (0–20)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  value={psr}
                  onChangeText={setPsr}
                />

                <Text style={s.label}>PSE (0–10)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  value={pse}
                  onChangeText={setPse}
                />

                <Text style={s.label}>Duração (minutos)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  value={duration}
                  onChangeText={setDuration}
                />

                <Text style={s.label}>Salto pré-sessão (cm)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  value={jumpPre}
                  onChangeText={setJumpPre}
                />

                <Text style={s.label}>Salto pós-sessão (cm)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  value={jumpPost}
                  onChangeText={setJumpPost}
                />

                <View style={s.metricInline}>
                  <Text style={s.muted}>Carga estimada</Text>
                  <Text style={s.value}>
                    {Number(pse || 0) * Number(duration || 0)} UA
                  </Text>
                </View>

                <Pressable
                  style={s.primary}
                  onPress={() => void saveSession()}
                >
                  <Text style={s.primaryText}>Salvar monitoramento</Text>
                </Pressable>
              </>
            )}

            <Text style={[s.cardTitle, { marginTop: 22 }]}>
              Histórico recente
            </Text>

            {sessions.length === 0 ? (
              <Text style={s.muted}>Nenhum registro encontrado.</Text>
            ) : (
              sessions.map((record) => (
                <View key={record.id} style={s.athlete}>
                  <Text style={s.athleteName}>
                    {record.session_date} · {record.load_ua ?? '—'} UA
                  </Text>
                  <Text style={s.muted}>
                    PSR {record.psr ?? '—'} · PSE {record.pse ?? '—'} · Salto{' '}
                    {record.jump_pre_cm ?? '—'} →{' '}
                    {record.jump_post_cm ?? '—'} cm
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={s.metric}>
      <Text style={s.muted}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  login: {
    flexGrow: 1,
    backgroundColor: C.bg,
    padding: 24,
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: 190,
    marginBottom: 14,
    backgroundColor: '#f4f3ef',
    borderRadius: 12,
  },
  eyebrow: {
    color: C.red,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
    marginTop: 12,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 8,
  },
  muted: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#1c1c23',
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: C.text,
    marginTop: 12,
  },
  label: {
    color: C.silver,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14,
  },
  primary: {
    backgroundColor: C.red,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryDisabled: {
    opacity: 0.65,
  },
  primaryText: {
    color: 'white',
    fontWeight: '900',
  },
  link: {
    color: '#f06a71',
    fontWeight: '800',
    textAlign: 'center',
    padding: 14,
  },
  warning: {
    backgroundColor: '#382027',
    color: '#ffd9dc',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  legal: {
    color: '#8e8e99',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 18,
  },
  shell: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 18,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  metric: {
    flex: 1,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
  },
  value: {
    fontSize: 25,
    fontWeight: '900',
    color: C.silver,
    marginTop: 8,
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 18,
    backgroundColor: '#19191f',
    padding: 6,
    borderRadius: 12,
  },
  navItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  navActive: {
    backgroundColor: '#72202a',
  },
  card: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: C.text,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  action: {
    backgroundColor: C.panel2,
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.line,
  },
  actionText: {
    color: C.text,
    fontWeight: '700',
  },
  athlete: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    borderRadius: 8,
  },
  selected: {
    backgroundColor: '#3a2025',
  },
  athleteName: {
    fontWeight: '800',
    color: C.text,
  },
  metricInline: {
    marginTop: 16,
    backgroundColor: '#111116',
    padding: 14,
    borderRadius: 10,
  },
});
