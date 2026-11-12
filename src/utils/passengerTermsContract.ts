import { parseContractSections, ParsedTermsSection } from './contractMarkdownParser';

export const PASSENGER_TERMS_CONTRACT_ID = 'KAVRO-PSG-TC-V0.1';
export const PASSENGER_TERMS_CONTRACT_VERSION = '0.1';
export const PASSENGER_TERMS_CONTRACT_DATE = '12 de novembro de 2026';
export const PASSENGER_TERMS_CONTRACT_TITLE = 'TERMOS E CONDIÇÕES GERAIS DE USO — PASSAGEIRO';
export const PASSENGER_TERMS_AFFIRMATIVE_TEXT =
  'Li e concordo integralmente com os Termos e Condições Gerais de Uso — Passageiro (Versão 0.1) e autorizo o registro eletrônico do meu aceite.';

export const PASSENGER_TERMS_RAW_TEXT = `# KAVRO DRIVE
## TERMOS E CONDIÇÕES GERAIS DE USO — PASSAGEIRO

Versão: 0.1 — Minuta jurídica para revisão
Data: 12 de novembro de 2026
Abrangência: Aplicativo de passageiros KAVRO DRIVE — Brasil
Situação: Documento em desenvolvimento. Não publicar antes da conclusão das regras operacionais e revisão jurídica.

---

### CLÁUSULA 1 — IDENTIFICAÇÃO DA PLATAFORMA

1.1. Os presentes Termos e Condições de Uso estabelecem as regras aplicáveis ao acesso e à utilização do aplicativo KAVRO DRIVE pelos passageiros.

1.2. A plataforma é disponibilizada pela pessoa jurídica:
- Razão social: [EMPRESA OPERADORA]
- CNPJ: [CNPJ]
- Endereço da sede: [ENDEREÇO]
- E-mail jurídico: [E-MAIL]
- Atendimento: [CANAL OFICIAL]
- Canal de privacidade: [E-MAIL]

1.3. Para os efeitos deste documento, considera-se PASSAGEIRO ou USUÁRIO a pessoa que utiliza o aplicativo para solicitar, contratar, acompanhar ou pagar serviços de transporte.

1.4. A utilização da plataforma estará sujeita à legislação brasileira e às condições previstas neste instrumento, sem prejuízo dos direitos legalmente assegurados aos consumidores.

### CLÁUSULA 2 — OBJETO E FUNCIONAMENTO

2.1. A KAVRO DRIVE disponibiliza uma plataforma tecnológica de mobilidade urbana que permite aproximar passageiros e motoristas cadastrados e aprovados.

2.2. A plataforma poderá oferecer:
- Criação e gestão de contas.
- Solicitação de transporte.
- Localização de motoristas disponíveis.
- Apresentação de estimativas de preços.
- Acompanhamento de viagens por GPS.
- Informações de identificação do motorista e veículo.
- Processamento de pagamentos.
- Histórico de viagens.
- Avaliações, suporte e comunicação de incidentes.
- Ferramentas de segurança e prevenção de fraudes.

2.3. A disponibilidade das funcionalidades dependerá da região, da categoria selecionada e das condições operacionais.

2.4. A prestação dos serviços observará a legislação de transporte, as normas municipais, as regras de proteção do consumidor e demais obrigações aplicáveis.

2.5. A natureza tecnológica da plataforma não afasta eventuais responsabilidades legais da KAVRO pelos serviços que organiza ou disponibiliza.

### CLÁUSULA 3 — ACEITAÇÃO DOS TERMOS

3.1. O utilizador deverá ter acesso a estes Termos antes da conclusão de seu cadastro ou da utilização das funcionalidades sujeitas à aceitação.

3.2. A aceitação será realizada por manifestação eletrónica afirmativa, em campo próprio do aplicativo.

3.3. O utilizador poderá consultar a versão vigente do documento a qualquer momento.

3.4. A KAVRO conservará evidências adequadas do aceite, incluindo data, hora, identificação da conta e versão do documento.

3.5. A aceitação não representa renúncia a direitos assegurados pela legislação brasileira.

### CLÁUSULA 4 — REQUISITOS PARA CRIAR UMA CONTA

4.1. O titular da conta deverá possuir, inicialmente, idade mínima de 18 anos e capacidade para realizar os atos necessários à contratação dos serviços.

4.2. Poderão ser solicitadas informações como:
- Nome completo.
- Número de telefone.
- E-mail.
- Data de nascimento.
- CPF, quando necessário para identificação, pagamento, segurança ou cumprimento de obrigação legal.
- Informações de pagamento.
- Dados de localização necessários às viagens.

4.3. O usuário compromete-se a fornecer informações verdadeiras, atualizadas e pertencentes a si.

4.4. A KAVRO poderá estabelecer verificações adicionais, proporcionais à finalidade e ao risco da operação.

4.5. A criação de uma conta não garante disponibilidade imediata de motoristas ou serviços.

### CLÁUSULA 5 — AUTENTICAÇÃO E SEGURANÇA DA CONTA

5.1. O acesso poderá ocorrer por telefone, código temporário, e-mail ou outro método de autenticação autorizado.

5.2. O usuário deverá proteger seus dispositivos, credenciais e códigos de verificação.

5.3. É proibido utilizar informações de terceiros sem autorização.

5.4. Havendo suspeita de acesso não autorizado, o passageiro deverá comunicar imediatamente o ocorrido pelo canal de suporte.

5.5. A KAVRO poderá exigir confirmação adicional de identidade para impedir fraudes ou recuperar contas comprometidas.

5.6. A plataforma deverá manter controles adequados para reduzir riscos de acessos indevidos.

### CLÁUSULA 6 — CONTAS FALSAS E UTILIZAÇÃO INDEVIDA

6.1. É proibido criar contas utilizando identidades falsas, documentos adulterados ou números de telefone de terceiros sem autorização.

6.2. Não será permitido utilizar o aplicativo para fraudar pagamentos, obter vantagens indevidas ou praticar atividades ilícitas.

6.3. O fornecimento intencional de informações falsas poderá resultar em restrições de acesso, observados os procedimentos legais aplicáveis.

6.4. O utilizador poderá solicitar correção de informações incorretas e contestar decisões que afetem sua conta.

### CLÁUSULA 7 — SOLICITAÇÃO DE CORRIDAS

7.1. Para solicitar uma viagem, o passageiro deverá informar o ponto de embarque, o destino e, quando aplicável, a categoria desejada.

7.2. O aplicativo apresentará as informações disponíveis sobre a viagem, incluindo estimativa de preço e modalidade de pagamento.

7.3. A solicitação estará sujeita à existência de motoristas elegíveis e disponíveis.

7.4. A viagem será considerada aceite após a confirmação pelo sistema e pelo motorista correspondente.

7.5. O passageiro deverá acompanhar as informações exibidas no aplicativo e apresentar-se no ponto de embarque combinado.

7.6. A KAVRO poderá impedir solicitações que apresentem risco relevante, inconsistência técnica ou descumprimento legal, mediante critérios objetivos.

### CLÁUSULA 8 — CATEGORIAS DE TRANSPORTE

8.1. A plataforma poderá disponibilizar categorias como:
- KAVRO GO.
- KAVRO PLUS.
- KAVRO EXEC.

8.2. Cada categoria poderá possuir requisitos específicos de veículo, conforto e tarifas.

8.3. A existência de determinada categoria numa cidade não garante sua disponibilidade em todos os horários.

8.4. O passageiro deverá visualizar a categoria e o preço aplicável antes da confirmação.

8.5. Qualquer alteração de categoria durante uma solicitação deverá ser comunicada ao usuário e, quando modificar condições relevantes, depender de sua concordância.

### CLÁUSULA 9 — FORMAÇÃO DO PREÇO

9.1. O valor da corrida poderá considerar:
- Tarifa base.
- Distância estimada.
- Tempo estimado.
- Categoria selecionada.
- Tarifa mínima.
- Eventual tarifa dinâmica, quando implementada.
- Pedágios, estacionamento ou outras despesas previamente previstas.
- Outros componentes expressamente divulgados ao passageiro.

9.2. Os valores deverão ser apresentados de maneira clara antes da contratação.

9.3. O preço poderá ser ajustado nas hipóteses previamente informadas, como alteração de destino, paradas solicitadas ou diferenças relevantes no percurso.

9.4. Não serão admitidos aumentos arbitrários ou cobranças adicionais sem fundamento contratual e legal.

9.5. Caso o valor cobrado seja diferente do informado, o usuário poderá consultar a discriminação da cobrança e solicitar revisão.

9.6. As tarifas poderão variar entre cidades e categorias, desde que os critérios sejam transparentes e respeitem as obrigações legais.

### CLÁUSULA 10 — ESTIMATIVAS DE TEMPO E CHEGADA

10.1. Os horários apresentados no aplicativo são estimativas baseadas nas informações disponíveis.

10.2. O tempo de chegada poderá variar devido ao trânsito, condições climáticas, bloqueios de vias, acidentes e outros fatores.

10.3. A KAVRO deverá informar alterações relevantes identificadas pelo sistema, quando tecnicamente possível.

10.4. O passageiro poderá comunicar atrasos excessivos e solicitar assistência ou cancelamento conforme as regras aplicáveis.

10.5. As estimativas não constituem garantia absoluta de chegada em horário determinado, sem prejuízo das responsabilidades previstas em lei.

### CLÁUSULA 11 — IDENTIFICAÇÃO DO MOTORISTA

11.1. Antes do embarque, o aplicativo poderá apresentar:
- Nome do motorista.
- Fotografia de perfil.
- Marca e modelo do veículo.
- Cor.
- Placa.
- Categoria da corrida.
- Avaliação, quando disponível.

11.2. O passageiro deverá conferir as informações antes de entrar no veículo.

11.3. Caso o motorista ou o veículo não corresponda às informações apresentadas, o passageiro deverá evitar o embarque e comunicar o ocorrido.

11.4. O aplicativo poderá disponibilizar mecanismos adicionais de confirmação, como código de segurança ou PIN da viagem.

11.5. A KAVRO deverá manter procedimentos para analisar denúncias de utilização irregular de contas ou veículos.

### CLÁUSULA 12 — EMBARQUE E DESEMBARQUE

12.1. O passageiro deverá aguardar em local permitido e seguro.

12.2. O embarque e o desembarque deverão respeitar as normas de trânsito e as condições de segurança.

12.3. Quando o ponto indicado for inseguro ou proibido, poderá ser necessário selecionar outro local adequado.

12.4. O passageiro deverá respeitar a capacidade legal do veículo e utilizar os dispositivos de segurança obrigatórios.

12.5. O motorista poderá recusar embarque que apresente risco concreto à segurança ou descumpra exigência legal, sem discriminação arbitrária.

### CLÁUSULA 13 — ROTAS E ALTERAÇÕES DE DESTINO

13.1. O sistema poderá sugerir trajetos considerando distância, tempo e condições de circulação.

13.2. As rotas indicadas têm natureza auxiliar e não substituem as regras de trânsito.

13.3. O passageiro poderá solicitar alteração de destino quando a funcionalidade estiver disponível.

13.4. Alterações que modifiquem o valor da viagem deverão ser informadas de forma clara.

13.5. Desvios injustificados poderão ser denunciados pelo passageiro.

13.6. Quando houver divergência relevante sobre o percurso, a KAVRO deverá oferecer mecanismo de análise e contestação.

### CLÁUSULA 14 — PAGAMENTO POR CARTÃO DE CRÉDITO

14.1. A KAVRO poderá disponibilizar pagamento por cartão de crédito integrado ao aplicativo.

14.2. Nesta modalidade, serão aceites apenas pagamentos à vista, sem parcelamento, enquanto essa condição comercial estiver vigente.

14.3. Os pagamentos serão processados por instituição financeira ou gateway contratado pela plataforma.

14.4. A cobrança poderá ocorrer após a conclusão da corrida, de acordo com a estrutura de autorização e captura do prestador financeiro.

14.5. Poderão ser realizadas verificações ou autorizações prévias, quando previstas na operação, com informação adequada ao utilizador.

14.6. Cartões recusados, expirados ou considerados suspeitos poderão impedir a utilização dessa modalidade.

14.7. O processamento deverá observar padrões de segurança aplicáveis aos dados de cartão.

14.8. A KAVRO não deverá armazenar diretamente códigos de segurança ou dados completos de cartões quando o processamento utilizar tokenização pelo gateway.

14.9. Cobranças duplicadas ou indevidas estarão sujeitas a investigação e correção.

### CLÁUSULA 15 — PAGAMENTO VIA PIX

15.1. Caso esteja habilitado, o Pix será processado por meio de instituição ou gateway integrado.

15.2. O pagamento poderá ocorrer por QR Code dinâmico ou código copia e cola vinculado à corrida.

15.3. A confirmação deverá ser obtida pelo sistema financeiro integrado.

15.4. Comprovantes enviados manualmente não substituem necessariamente a confirmação bancária.

15.5. As condições para cancelamento, devolução e regularização de pagamentos serão apresentadas no aplicativo.

15.6. O usuário não deverá realizar transferências para chaves particulares não autorizadas pela plataforma quando a corrida estiver configurada para pagamento digital.

### CLÁUSULA 16 — PAGAMENTO EM DINHEIRO

16.1. Quando disponível, o passageiro poderá selecionar dinheiro como forma de pagamento.

16.2. O valor devido será apresentado pelo aplicativo e cobrado diretamente pelo motorista.

16.3. Cobranças adicionais não previstas não serão autorizadas.

16.4. O motorista deverá registrar corretamente a situação do pagamento.

16.5. O passageiro poderá contestar cobrança duplicada, indicação incorreta de inadimplência ou divergência sobre o valor efetivamente pago.

16.6. As regras de troco, pagamento incompleto e resolução de divergências deverão ser informadas na política de pagamentos.

### CLÁUSULA 17 — FALHAS E RECUSAS DE PAGAMENTO

17.1. Uma transação poderá ser recusada por motivos técnicos, insuficiência de limite, suspeita de fraude ou restrição da instituição financeira.

17.2. O passageiro será informado sobre a falha, quando identificada.

17.3. A plataforma poderá solicitar outro meio válido de pagamento para regularizar valores efetivamente devidos.

17.4. A existência de cobrança pendente não autoriza constrangimento, ameaça ou cobrança abusiva.

17.5. O usuário terá acesso a canal de contestação e regularização.

17.6. A KAVRO deverá evitar cobranças duplicadas decorrentes de tentativas repetidas de processamento.

### CLÁUSULA 18 — CANCELAMENTO DE CORRIDAS

18.1. O passageiro poderá solicitar cancelamento pelos meios disponibilizados no aplicativo.

18.2. As condições de cancelamento dependerão do estado da solicitação e das regras previamente divulgadas.

18.3. Poderá existir taxa de cancelamento nas hipóteses legalmente admissíveis, desde que seu valor ou método de cálculo seja claramente informado antes da contratação.

18.4. A cobrança deverá considerar a efetiva ocorrência das condições previstas e não poderá representar penalidade abusiva.

18.5. Cancelamentos motivados por irregularidades do motorista, falhas da plataforma ou circunstâncias que afastem legitimamente a cobrança deverão ser analisados para isenção ou devolução.

18.6. O usuário poderá contestar qualquer taxa de cancelamento.

18.7. A KAVRO deverá disponibilizar o motivo e a discriminação de valores cobrados.

### CLÁUSULA 19 — TEMPO DE ESPERA

19.1. O sistema poderá estabelecer prazo de espera após a chegada do motorista ao ponto de embarque.

19.2. Caso exista tarifa de espera, sua incidência, período de tolerância e método de cálculo deverão ser divulgados previamente.

19.3. O tempo de espera deverá ser apurado por registos verificáveis do sistema.

19.4. Não serão admitidas cobranças de espera decorrentes de localização falsa ou registos manipulados.

19.5. O passageiro poderá solicitar revisão do tempo contabilizado.

### CLÁUSULA 20 — REEMBOLSOS E ESTORNOS

20.1. O passageiro poderá solicitar revisão e restituição de cobranças indevidas ou de valores reembolsáveis conforme a legislação e as regras aplicáveis.

20.2. O pedido poderá envolver situações como:
- Cobrança duplicada.
- Corrida não realizada.
- Valor superior ao devido.
- Cobrança de cancelamento incorreta.
- Pagamento realizado sem a correspondente prestação do serviço.
- Falhas comprovadas na prestação do serviço.
- Outras hipóteses legais de restituição.

20.3. A análise deverá considerar o histórico da corrida, o método de pagamento, as provas disponíveis e os direitos do consumidor.

20.4. Quando devido, o reembolso seguirá procedimento adequado ao meio de pagamento utilizado.

20.5. O prazo de disponibilização de um estorno no cartão poderá depender também da instituição financeira emissora.

20.6. O passageiro deverá receber informação sobre o andamento e o resultado da solicitação.

20.7. Permanecem preservados os direitos legais de arrependimento, reembolso e reparação nas hipóteses aplicáveis, considerando a natureza e o momento da prestação do serviço.

### CLÁUSULA 21 — CUPÕES, PROMOÇÕES E DESCONTOS

21.1. A KAVRO poderá oferecer promoções, campanhas, cupões e créditos promocionais.

21.2. Cada promoção deverá apresentar suas regras, período de vigência e eventuais restrições de utilização.

21.3. É proibida a criação de contas falsas ou a manipulação de operações para obter benefícios indevidos.

21.4. Benefícios obtidos de forma fraudulenta poderão ser cancelados, mediante fundamentação e possibilidade de contestação.

21.5. A plataforma não poderá modificar arbitrariamente promoções já contratadas em prejuízo do consumidor.

### CLÁUSULA 22 — OBRIGAÇÕES DOS PASSAGEIROS

22.1. O passageiro deverá agir de boa-fé e respeitar a legislação aplicável.

22.2. Durante a viagem, deverá:
- Respeitar o motorista e os demais ocupantes.
- Utilizar o cinto de segurança.
- Respeitar a capacidade do veículo.
- Não comprometer a condução segura.
- Não danificar intencionalmente o automóvel.
- Não portar objetos ilícitos.
- Não exigir infrações de trânsito.
- Não ameaçar ou constranger outras pessoas.
- Respeitar as condições de embarque e desembarque.

22.3. O passageiro não poderá solicitar que o motorista conduza sob condições ilegais ou inseguras.

22.4. Danos comprovadamente causados por conduta ilícita, dolosa ou culposa poderão ensejar responsabilização conforme a legislação.

### CLÁUSULA 23 — CONDUTAS PROIBIDAS

23.1. São proibidas, entre outras:
- Agressões físicas ou verbais.
- Ameaças.
- Assédio sexual ou moral.
- Discriminação de qualquer natureza.
- Ações que coloquem o condutor ou terceiros em perigo.
- Fraudes de pagamento.
- Falsas denúncias intencionais.
- Utilização de identidades fraudulentas.
- Transporte de objetos proibidos por lei.
- Tentativas de manipular o GPS ou os valores da corrida.
- Utilização do aplicativo para atividades criminosas.

23.2. O descumprimento poderá justificar medidas proporcionais de segurança, inclusive restrição temporária da conta.

23.3. A KAVRO deverá assegurar canais de defesa e contestação adequados.

### CLÁUSULA 24 — SEGURANÇA DOS PASSAGEIROS

24.1. A segurança constitui condição essencial para a operação da plataforma.

24.2. A KAVRO deverá manter procedimentos compatíveis com seu modelo operacional para verificação e acompanhamento dos motoristas.

24.3. Poderão ser disponibilizados mecanismos como:
- Identificação do motorista e veículo.
- Código de confirmação da viagem.
- Partilha do percurso com contactos de confiança.
- Registo de localização.
- Canal de denúncia.
- Suporte para incidentes.
- Acesso facilitado a orientações de emergência.

24.4. Essas funcionalidades somente deverão ser anunciadas como disponíveis quando estiverem efetivamente implementadas e operacionais.

24.5. Em caso de emergência, o utilizador deverá procurar imediatamente os serviços públicos competentes, sem depender exclusivamente do suporte do aplicativo.

24.6. A KAVRO deverá apurar denúncias relacionadas a ameaças, violência e riscos relevantes, observando a legislação.

### CLÁUSULA 25 — ACIDENTES E INCIDENTES

25.1. Ocorrendo acidente, colisão, lesão ou incidente de segurança, a prioridade será a proteção da vida e da integridade das pessoas envolvidas.

25.2. O passageiro deverá procurar os serviços de emergência quando necessário.

25.3. O incidente poderá ser comunicado à KAVRO pelos canais oficiais.

25.4. A plataforma deverá disponibilizar procedimento para registo, acompanhamento e encaminhamento das informações pertinentes.

25.5. A responsabilidade por danos será apurada conforme a legislação, as circunstâncias do caso e as responsabilidades legalmente atribuíveis aos envolvidos.

25.6. A existência de motoristas parceiros não constitui, por si só, exclusão automática de responsabilidade da KAVRO.

25.7. Informações relativas a eventuais seguros, coberturas, limites e formas de acionamento deverão ser fornecidas com transparência.

### CLÁUSULA 26 — PASSAGEIROS MENORES DE IDADE

26.1. Na configuração inicial, o titular da conta deverá ser maior de 18 anos.

26.2. Crianças e adolescentes poderão ser transportados acompanhados por adulto responsável, respeitadas as normas aplicáveis.

26.3. O transporte de menores desacompanhados somente poderá ser disponibilizado mediante política específica, observadas as exigências legais e os procedimentos de segurança adequados.

26.4. Deverão ser respeitadas as normas relativas a dispositivos de retenção infantil, quando aplicáveis.

26.5. A KAVRO deverá considerar o melhor interesse de crianças e adolescentes nas funcionalidades e operações que possam envolvê-los.

26.6. Eventuais ferramentas específicas para menores dependerão de condições próprias de identificação, autorização, supervisão e privacidade.

### CLÁUSULA 27 — ACESSIBILIDADE E NÃO DISCRIMINAÇÃO

27.1. A KAVRO deverá adotar medidas para proporcionar atendimento compatível com as normas de acessibilidade e os direitos das pessoas com deficiência.

27.2. É proibida a discriminação de passageiros por características pessoais protegidas por lei.

27.3. As regras de atendimento a pessoas com deficiência deverão respeitar as exigências legais, inclusive quanto a cães-guia e demais direitos aplicáveis.

27.4. O usuário poderá comunicar situações de recusa discriminatória ou tratamento inadequado.

27.5. A plataforma deverá possuir procedimento apropriado para apurar essas ocorrências.

### CLÁUSULA 28 — BAGAGENS, OBJETOS E ANIMAIS

28.1. O transporte de bagagens deverá observar a capacidade e as condições de segurança do veículo.

28.2. A KAVRO poderá estabelecer regras para volumes excessivos, cargas incompatíveis ou objetos perigosos.

28.3. O transporte de animais de companhia deverá obedecer às condições da categoria e à política específica publicada, sem prejuízo dos direitos legalmente protegidos.

28.4. O usuário deverá evitar transportar materiais que possam causar risco ao veículo, ao motorista ou a terceiros.

28.5. Eventuais cobranças adicionais deverão ser informadas antecipadamente, quando admissíveis.

### CLÁUSULA 29 — OBJETOS ESQUECIDOS

29.1. Caso o passageiro esqueça algum objeto no veículo, poderá comunicar o ocorrido pelo aplicativo.

29.2. A KAVRO poderá disponibilizar procedimento para facilitar o contacto com o motorista e organizar a eventual devolução.

29.3. A devolução dependerá da localização do objeto e das circunstâncias verificadas, sem prejuízo das obrigações legais aplicáveis.

29.4. Caso haja cobrança por deslocamento adicional de devolução, ela deverá estar prevista de forma clara e ser legalmente admissível.

29.5. A KAVRO não poderá excluir antecipadamente responsabilidades que lhe sejam atribuídas por lei.

### CLÁUSULA 30 — COMUNICAÇÃO ENTRE PASSAGEIRO E MOTORISTA

30.1. O aplicativo poderá disponibilizar funcionalidades de chamada ou mensagem relacionadas à viagem.

30.2. A comunicação deverá ser limitada às finalidades legítimas da operação.

30.3. É proibida a utilização de contactos obtidos durante a viagem para assédio, perseguição, publicidade não autorizada ou divulgação indevida de informações pessoais.

30.4. Quando tecnicamente possível, poderão ser utilizados mecanismos de proteção dos números telefónicos.

30.5. Registos de comunicação somente serão tratados nos limites e condições previstos na Política de Privacidade e na legislação aplicável.

### CLÁUSULA 31 — AVALIAÇÕES E RECLAMAÇÕES

31.1. O passageiro poderá avaliar a experiência da viagem quando essa funcionalidade estiver disponível.

31.2. As avaliações deverão respeitar critérios de boa-fé e não poderão ser utilizadas para perseguição ou discriminação.

31.3. O aplicativo poderá disponibilizar categorias de reclamação relacionadas a:
- Conduta inadequada.
- Problema de segurança.
- Motorista ou veículo divergente.
- Cobrança incorreta.
- Rota inadequada.
- Problema de pagamento.
- Objeto esquecido.
- Outra ocorrência relevante.

31.4. A KAVRO deverá manter procedimento de análise, resposta e registo das reclamações.

31.5. Denúncias relacionadas a risco à segurança deverão receber tratamento prioritário conforme a gravidade.

### CLÁUSULA 32 — FOTOGRAFIAS, ÁUDIOS E GRAVAÇÕES

32.1. A realização de registos de imagem, áudio ou vídeo relacionados às viagens deverá respeitar a legislação, a privacidade e os direitos das pessoas envolvidas.

32.2. A divulgação pública de imagens ou informações pessoais de motoristas ou passageiros sem fundamento legal poderá gerar responsabilização.

32.3. Caso a plataforma ofereça recurso de gravação de segurança, suas condições deverão ser informadas previamente.

32.4. A recolha, armazenamento, acesso e eliminação de gravações deverão observar finalidades legítimas, medidas de segurança e prazos adequados.

32.5. A disponibilização de conteúdos a autoridades deverá obedecer às hipóteses legais aplicáveis.

### CLÁUSULA 33 — PRIVACIDADE E PROTEÇÃO DE DADOS

33.1. A KAVRO poderá tratar dados necessários ao cadastro, funcionamento, pagamento e segurança das viagens.

33.2. As categorias de dados poderão incluir:
- Identificação e contacto.
- Localização de embarque e destino.
- Trajetos realizados.
- Histórico de viagens.
- Informações de pagamento.
- Informações técnicas de acesso.
- Registos de atendimento e reclamações.
- Outros dados estritamente necessários às finalidades informadas.

33.3. Os dados deverão ser tratados segundo bases legais adequadas e finalidades específicas.

33.4. A Política de Privacidade deverá explicar os destinatários das informações, períodos de retenção e direitos dos titulares.

33.5. O passageiro poderá exercer seus direitos nos termos da LGPD.

33.6. A KAVRO deverá implementar medidas técnicas e administrativas apropriadas para proteger informações pessoais.

33.7. O consentimento, quando necessário, deverá ser solicitado separadamente, de forma livre, informada e específica.

### CLÁUSULA 34 — GEOLOCALIZAÇÃO E HISTÓRICO DAS VIAGENS

34.1. A localização poderá ser utilizada para identificar pontos de embarque, calcular estimativas, acompanhar corridas e fornecer recursos de segurança.

34.2. As permissões de localização deverão observar as configurações do dispositivo e as finalidades informadas ao usuário.

34.3. A KAVRO deverá evitar a recolha de localização contínua quando não for necessária ao funcionamento da funcionalidade autorizada.

34.4. O histórico poderá ser conservado pelos períodos necessários ao cumprimento de obrigações legais, resolução de conflitos, segurança e demais finalidades legítimas.

34.5. O passageiro poderá consultar as informações disponibilizadas sobre suas viagens e exercer os direitos de privacidade aplicáveis.

### CLÁUSULA 35 — PARTILHA DE INFORMAÇÕES COM TERCEIROS

35.1. Dados necessários à execução da viagem poderão ser compartilhados com o motorista responsável.

35.2. Informações financeiras poderão ser transmitidas aos prestadores contratados para processar pagamentos.

35.3. Serviços de mapas, comunicação, hospedagem e prevenção de fraude poderão atuar como fornecedores tecnológicos, observadas as condições legais.

35.4. O compartilhamento deverá ser limitado ao necessário e acompanhado de salvaguardas adequadas.

35.5. A KAVRO não poderá comercializar dados pessoais de forma incompatível com a legislação e as finalidades informadas.

### CLÁUSULA 36 — BLOQUEIO E SUSPENSÃO DE CONTAS

36.1. A KAVRO poderá estabelecer medidas proporcionais para proteger a plataforma e seus utilizadores.

36.2. Poderão justificar restrições:
- Fraude comprovada ou indícios relevantes de fraude.
- Ameaças ou agressões.
- Utilização indevida de dados.
- Descumprimento grave das regras.
- Tentativas de comprometer o sistema.
- Inadimplência legítima não regularizada, conforme critérios previamente informados.
- Outras situações legalmente justificadas.

36.3. As medidas deverão considerar a gravidade e os elementos disponíveis.

36.4. O usuário deverá ser comunicado sobre a decisão, ressalvadas limitações legais ou de segurança.

36.5. Será disponibilizado canal para solicitar revisão.

36.6. O bloqueio da conta não eliminará direitos a reembolsos ou valores legalmente devidos.

### CLÁUSULA 37 — EXCLUSÃO DA CONTA

37.1. O passageiro poderá solicitar a exclusão de sua conta pelos mecanismos disponibilizados.

37.2. A exclusão poderá depender da resolução de viagens ou operações financeiras pendentes, quando juridicamente necessário.

37.3. Dados pessoais deverão ser eliminados ou conservados conforme as bases legais e obrigações aplicáveis.

37.4. A plataforma deverá informar, em sua Política de Privacidade, as principais hipóteses de conservação.

37.5. A exclusão da conta não impede o exercício posterior de direitos legalmente assegurados.

### CLÁUSULA 38 — DISPONIBILIDADE DO APLICATIVO

38.1. A plataforma poderá passar por atualizações, manutenção e interrupções técnicas.

38.2. A KAVRO deverá adotar medidas razoáveis de continuidade, segurança e recuperação de serviços.

38.3. Quando uma falha afetar corrida ou pagamento, deverão existir mecanismos apropriados de suporte e correção.

38.4. A indisponibilidade técnica não exclui automaticamente responsabilidades previstas na legislação.

### CLÁUSULA 39 — RESPONSABILIDADE CIVIL

39.1. Os direitos e obrigações das partes serão interpretados à luz da legislação brasileira, especialmente das normas de defesa do consumidor e de responsabilidade civil.

39.2. O passageiro poderá ser responsabilizado por danos que lhe sejam juridicamente imputáveis.

39.3. A KAVRO responderá pelos danos e falhas que lhe forem legalmente atribuídos, conforme as circunstâncias de cada caso.

39.4. Nenhuma cláusula deste documento poderá ser utilizada para afastar antecipadamente direitos indisponíveis ou obrigações legais de reparação.

39.5. A apuração de responsabilidades considerará os factos, os elementos disponíveis e as regras legais aplicáveis.

### CLÁUSULA 40 — ALTERAÇÕES DOS TERMOS

40.1. A KAVRO poderá atualizar estes Termos para adequação legal, segurança, melhorias operacionais ou alterações no funcionamento do serviço.

40.2. Alterações relevantes deverão ser comunicadas de forma clara.

40.3. Quando necessário, o aplicativo solicitará novo aceite.

40.4. As versões anteriores deverão permanecer arquivadas para fins de comprovação.

40.5. Alterações não poderão prejudicar retroativamente direitos legalmente constituídos.

### CLÁUSULA 41 — ATENDIMENTO E RESOLUÇÃO DE CONFLITOS

41.1. A KAVRO deverá disponibilizar canais de atendimento e de resolução de reclamações.

41.2. O utilizador poderá solicitar informações sobre corridas, cobranças, segurança, dados pessoais e funcionamento da plataforma.

41.3. As reclamações deverão possuir mecanismos de registo e acompanhamento.

41.4. O atendimento poderá adotar procedimentos diferenciados para emergências, problemas financeiros e solicitações comuns.

41.5. A resolução administrativa não restringe o direito de acesso às autoridades competentes ou ao Poder Judiciário.

### CLÁUSULA 42 — LEGISLAÇÃO APLICÁVEL E FORO

42.1. Estes Termos serão regidos pela legislação brasileira.

42.2. Aplicam-se as normas de proteção do consumidor, transporte, proteção de dados e demais disposições pertinentes.

42.3. Eventuais conflitos serão submetidos aos órgãos e tribunais competentes segundo a legislação aplicável, preservadas as garantias de acesso à Justiça e as regras protetivas de competência territorial.

### CLÁUSULA 43 — DISPOSIÇÕES FINAIS

43.1. Os Termos deverão estar disponíveis ao passageiro dentro do aplicativo.

43.2. A Política de Privacidade e demais documentos complementares serão disponibilizados separadamente.

43.3. Eventual nulidade de cláusula não implicará necessariamente invalidade integral do instrumento.

43.4. Os documentos aplicáveis deverão ser interpretados de maneira coerente, respeitando a legislação e os direitos dos utilizadores.

43.5. Nenhuma condição contratual deverá ser interpretada como autorização para práticas abusivas ou ilícitas.

---

### ANEXO I — CONDIÇÕES COMERCIAIS DO PASSAGEIRO

As condições comerciais deverão ser preenchidas e publicadas antes da ativação das respetivas funcionalidades:

Cartão de crédito:
- Pagamento à vista.
- Parcelamento indisponível.
- Processamento por gateway contratado.
- Preço final apresentado antes da confirmação.
- Ajustes sujeitos a regras claras e previamente informadas.

Pix:
- Disponível apenas quando habilitado.
- Confirmação eletrónica pelo gateway.
- Regras de devolução e cancelamento divulgadas ao usuário.

Dinheiro:
- Disponível apenas quando habilitado.
- Pagamento ao motorista conforme valor apresentado.
- Mecanismo de contestação de divergências.

Taxas adicionais a definir:
- Cancelamento: [DEFINIR].
- Tempo de espera: [DEFINIR].
- Pedágios: [DEFINIR].
- Paradas adicionais: [DEFINIR].
- Outras cobranças: [DEFINIR].

Nenhuma cobrança adicional deverá ser aplicada sem fundamento legal e informação adequada ao consumidor.

---

### ANEXO II — REGISTO DE ACEITE ELETRÓNICO

Quando o passageiro aceitar os Termos, o sistema deverá preservar, conforme a legislação:
- 1. Identificador da conta.
- 2. Identificador e versão do contrato.
- 3. Data e hora do aceite.
- 4. Evidência da manifestação afirmativa do utilizador.
- 5. Identificação técnica da sessão, nos limites legais.
- 6. Referência íntegra ao conteúdo aceite.
- 7. Histórico de novos aceites, quando necessários.

O comprovativo deverá permitir identificar qual versão dos Termos foi aceite, sem recolha excessiva de dados.`;

export function parsePassengerTermsSections(): ParsedTermsSection[] {
  return parseContractSections(PASSENGER_TERMS_RAW_TEXT);
}

