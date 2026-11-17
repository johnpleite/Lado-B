  <div align="center">


  # Lado B - Uma experiência musical
 <img src="assets/images/icon.png" alt= "Logo do aplicativo mobile" width=220px >

<br>
<br>

<img src= "https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white&style=for-the-badge" alt="Typescript" >

<img src= "https://img.shields.io/badge/-React%20native-000?&logo=React&logoColor=white&style=for-the-badge" alt="React Native" >

<img src= "https://img.shields.io/badge/firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" >

---
<div align="left">

# Visão geral :

Este repositório é dedicado à disciplina de **Desenvolvimento de Sistemas de Informação (BSI/UFRPE)**. O **Lado B** é um aplicativo mobile voltado a recomendação personalizada de obras musicais, registro, avaliação e análise crítica de produções musicais. A proposta estimula o debate sobre essas obras, permite reunir playlists salvas e desenvolve uma comunidade colaborativa.

O catálogo musical do projeto tem como referência a análise exploratória do dataset Album of the Year, desenvolvida no projeto [PISI-III](https://github.com/johnpleite/PISI-III).

## Instalação e execução

### Pré-requisitos

- [Node.js](https://nodejs.org/) LTS, que inclui o npm.
- [Expo Go](https://expo.dev/go) instalado no celular para testar o aplicativo.

### Instalar dependências

Clone o repositório e entre na pasta do projeto:

```powershell
git clone https://github.com/johnpleite/Lado-B.git
cd Lado-B
```

Instale as dependências declaradas no projeto:

```powershell
npm install
```

### Abrir no Expo Go

Inicie o servidor de desenvolvimento:

```powershell
npx expo start
```

Escaneie o QR code exibido no terminal com o Expo Go. O celular e o computador devem estar na mesma rede Wi-Fi. Se a conexão local não funcionar, inicie o Expo no modo túnel:

```powershell
npx expo start --tunnel
```

Para executar no navegador, use `npx expo start --web`. Para verificar o código com o ESLint, use `npm run lint`.

## APIs e serviços utilizados

- **Firebase Authentication**: criação de conta, login, logout, reautenticação e atualização de dados de acesso.
- **Cloud Firestore (Firebase)**: armazenamento de perfis, avaliações, playlists e metadados das obras.
- **MusicBrainz Web Service**: pesquisa de lançamentos pelo título do álbum e artista em `https://musicbrainz.org/ws/2/release/`. As consultas são limitadas a uma por segundo e não exigem chave de API.
- **Cover Art Archive**: consulta de capas pelo identificador do lançamento MusicBrainz em `https://coverartarchive.org/release/{id}`. As imagens são servidas pelo Cover Art Archive ou pelo domínio `archive.org` e armazenadas em cache no dispositivo.
- **Album of the Year**: não é consumido como API; o aplicativo abre a página de referência externa do álbum.

### Ícones

Os ícones da interface usam o componente `SymbolView` do Expo Symbols: **SF Symbols**, da Apple, no iOS, e **Material Symbols**, do Google, no Android e na Web. A fonte Material Symbols é incluída pelo Expo Symbols no bundle Android; o projeto não a carrega diretamente. Os símbolos musicais e outros glifos decorativos são caracteres renderizados pela fonte do sistema.

---

# Equipe e orientação :

**Docentes Orientadores:** Prof. Dr. Gabriel Alves de Albuquerque Júnior; Profa. Dra. Maria da Conceição Moraes Batista.

**Discente:** João Pedro Leite Aires.

---

# Uso de inteligência artificial :

Ferramentas de inteligência artificial foram utilizadas como apoio à elaboração e à atualização da documentação deste repositório. O conteúdo gerado com esse apoio deve ser revisado pela equipe, que mantém a responsabilidade pelas informações publicadas.
