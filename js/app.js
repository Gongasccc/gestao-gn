import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

    const app = initializeApp({
      apiKey:"AIzaSyA0eKe5JypkhtfrssIie0BA5g_2QMzr5d0",
      authDomain:"gestao-gn.firebaseapp.com",
      projectId:"gestao-gn",
      storageBucket:"gestao-gn.firebasestorage.app",
      appId:"1:443510448711:web:a615ebd9cf2ec549e60762"
    });
    const db = getFirestore(app); 
    const auth = getAuth(app);
    const appId = 'gestao-gn-app';

    let userId = null, userName = "", userAvatarUrl = "", isLoginMode = true, currentSuperId = null, unsusbscribes = [], pageHistory = ['menu-principal'];
    let viagensData = [], currentTripId = null, tempCapaUrl = "", minhaRede = [], currentTripDoc = null;
    let timelineEventsData = [], tempEventFoto = "", despesasData = [];
    let livrosReceitasData = [], currentLivroId = null, receitasLivroAtual = [], categoriasIndiceLivro = [], currentRecipePageIndex = 0, tempRecipeFoto = "", tempCapaLivroUrl = "";
    let documentosList = [], pastasList = [];
    let carrosData = [], currentCarroId = null, tempCarFoto = "", carDocsList = [], carPastasList = [];
    let modoDespesasAtivo = 'splitwise';

    const iconTrash = `<svg class="icon-svg" style="width:16px;height:16px" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const iconEdit = `<svg class="icon-svg" style="width:16px;height:16px" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    const iconBackArrow = `<svg class="icon-svg" style="width:22px;height:22px;margin:0;" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
    const iconGear = `<div class="circle-icon-btn" onclick="navegarMenu('page-detalhes-viagem-edit')"><svg class="icon-svg" style="margin:0;width:18px;height:18px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>`;

    const pageTitles = {
      'menu-principal': 'Início',
      'menu-viagens': 'Viagens',
      'menu-supermercados': 'Supermercados',
      'menu-familia': 'Amigos',
      'menu-receitas': 'Livro de Receitas',
      'menu-documentos': 'Meus Documentos',
      'menu-carros': 'Garagem',
      'page-add-carro': 'Adicionar Veículo',
      'page-detalhe-carro': 'Documentos do Veículo',
      'menu-notificacoes': 'Notificações',
      'menu-biblioteca': 'Biblioteca',
      'menu-perfil': 'Perfil',
      'menu-definicoes': 'Definições',
      'menu-nova-viagem': 'Nova Viagem',
      'page-detalhes-viagem-edit': 'Detalhes da Viagem',
      'menu-super-logos': 'Lojas & Cartões',
      'menu-compras-semanais': 'Lista Semanal',
      'menu-compras-rapidas': 'Lista Rápida'
    };

    const mainPagesList = ['menu-principal', 'menu-viagens', 'menu-supermercados', 'menu-familia', 'menu-carros', 'menu-notificacoes', 'menu-biblioteca', 'menu-receitas', 'menu-documentos'];

    const svgCategorias = {
        cafe: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`,
        restaurante: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"></path></svg>`,
        supermercado: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`,
        compras: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
        casa: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
        gasolina: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><path d="M3 22V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18"></path><path d="M14 13h4a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h0"></path></svg>`,
        hotel: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"></path><path d="M4 10V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"></path></svg>`,
        lazer: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>`,
        geral: `<svg class="icon-svg" style="margin:0;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M16 10H8.5a2.5 2.5 0 0 1 0-5H12"></path></svg>`
    };

    function obterCategoriaPorTexto(txt) {
        if(!txt) return { nome: 'Geral', icon: svgCategorias.geral };
        const t = txt.toLowerCase();
        if(t.includes('café') || t.includes('cafe') || t.includes('galão')) return { nome: 'Café', icon: svgCategorias.cafe };
        if(t.includes('jantar') || t.includes('almoço') || t.includes('restaurante') || t.includes('comida') || t.includes('pizza') || t.includes('ubereats') || t.includes('uber eats') || t.includes('bolt food')) return { nome: 'Restauração', icon: svgCategorias.restaurante };
        if(t.includes('supermercado') || t.includes('continente') || t.includes('pingo') || t.includes('lidl') || t.includes('auchan')) return { nome: 'Supermercado', icon: svgCategorias.supermercado };
        if(t.includes('roupa') || t.includes('zara') || t.includes('compras') || t.includes('sapatos')) return { nome: 'Vestuário', icon: svgCategorias.compras };
        if(t.includes('mobília') || t.includes('mobilia') || t.includes('casa') || t.includes('ikea') || t.includes('decoração')) return { nome: 'Casa & Mobília', icon: svgCategorias.casa };
        if(t.includes('gasolina') || t.includes('combustível') || t.includes('gasóleo') || t.includes('posto') || t.includes('portagem') || t.includes('uber') || t.includes('bolt')) return { nome: 'Transportes', icon: svgCategorias.gasolina };
        if(t.includes('hotel') || t.includes('airbnb') || t.includes('alojamento') || t.includes('quarto')) return { nome: 'Alojamento', icon: svgCategorias.hotel };
        if(t.includes('bilhete') || t.includes('museu') || t.includes('bar') || t.includes('festa') || t.includes('gin')) return { nome: 'Lazer', icon: svgCategorias.lazer };
        return { nome: 'Geral', icon: svgCategorias.geral };
    }

    window.atualizarIconeCategoriaAutomático = (val) => {
        const cat = obterCategoriaPorTexto(val);
        document.getElementById('exp-icon-box').innerHTML = cat.icon;
    };

    window.uploadFotoDiretaPerfil = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            userAvatarUrl = e.target.result;
            renderAvatarElement(document.getElementById('sidebar-user-avatar'), userName, userAvatarUrl);
            renderAvatarElement(document.getElementById('top-user-avatar'), userName, userAvatarUrl);
            renderAvatarElement(document.getElementById('profile-page-avatar'), userName, userAvatarUrl);
            if(document.getElementById('btn-remover-foto-perfil')) document.getElementById('btn-remover-foto-perfil').style.display = 'inline-flex';
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId), { avatarUrl: userAvatarUrl }, { merge: true });
        };
        reader.readAsDataURL(file);
    };

    window.removerFotoPerfil = async () => {
        if(confirm("Remover a tua foto de perfil?")) {
            userAvatarUrl = "";
            renderAvatarElement(document.getElementById('sidebar-user-avatar'), userName, userAvatarUrl);
            renderAvatarElement(document.getElementById('top-user-avatar'), userName, userAvatarUrl);
            renderAvatarElement(document.getElementById('profile-page-avatar'), userName, userAvatarUrl);
            if(document.getElementById('btn-remover-foto-perfil')) document.getElementById('btn-remover-foto-perfil').style.display = 'none';
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId), { avatarUrl: "" }, { merge: true });
        }
    };

    window.uploadFotoDiretaCarro = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            tempCarFoto = e.target.result;
            document.getElementById('preview-car-photo').src = tempCarFoto;
            document.getElementById('preview-car-photo').style.display = 'block';
            document.getElementById('msg-sem-car-photo').style.display = 'none';
        };
        reader.readAsDataURL(file);
    };

    window.uploadFotoDiretaCapaNova = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            tempCapaUrl = e.target.result;
            document.getElementById('preview-capa-viagem').src = tempCapaUrl;
            document.getElementById('preview-capa-viagem').style.display = 'block';
            document.getElementById('msg-sem-capa').style.display = 'none';
        };
        reader.readAsDataURL(file);
    };

    window.uploadFotoDiretaCapaExistente = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const b64 = e.target.result;
            document.getElementById('detalhe-viagem-img').src = b64;
            await updateDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId), { capa: b64 });
        };
        reader.readAsDataURL(file);
    };

    window.uploadFotoDiretaCapaLivro = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            tempCapaLivroUrl = e.target.result;
            document.getElementById('preview-capa-livro-nova').src = tempCapaLivroUrl;
            document.getElementById('preview-capa-livro-nova').style.display = 'block';
            document.getElementById('msg-sem-capa-livro').style.display = 'none';
        };
        reader.readAsDataURL(file);
    };

    window.toggleAuthMode = () => { 
        isLoginMode = !isLoginMode; 
        document.getElementById('auth-title').innerText = isLoginMode ? 'Entrar na App' : 'Criar Conta';
        document.getElementById('btn-login-submit').innerText = isLoginMode ? 'Entrar' : 'Registar e Entrar';
        document.getElementById('auth-confirm-password').style.display = isLoginMode ? 'none' : 'block';
    };

    function obterIniciaisNome(nomeCompleto) {
        if(!nomeCompleto) return "U";
        const partes = nomeCompleto.trim().split(/\s+/);
        if(partes.length === 1) return partes[0].charAt(0).toUpperCase();
        return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
    }

    window.handleAuth = async () => {
        const userTyped = document.getElementById('auth-username').value.trim(); 
        const pass = document.getElementById('auth-password').value; 
        const fakeEmail = userTyped.toLowerCase().replace(/[^a-z0-9]/g, '') + "@gestaogn.app";
        if (!userTyped || !pass) return;
        try { 
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, fakeEmail, pass);
            } else { 
                const cred = await createUserWithEmailAndPassword(auth, fakeEmail, pass); 
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', cred.user.uid), {
                  uid: cred.user.uid, 
                  username: userTyped, 
                  searchName: userTyped.toLowerCase(),
                  theme: 'dark',
                  accentColor: '#FF6B00',
                  avatarUrl: '',
                  allowLocation: false,
                  allowNotifications: false
                }); 
            }
        } catch(e) { 
            document.getElementById('auth-error').innerText = "Erro no Login. Verifica os dados."; 
            document.getElementById('auth-error').style.display = 'block'; 
        }
    };

    window.fazerLogout = async () => { 
        unsusbscribes.forEach(f => f());
        unsusbscribes = [];
        fecharModal('modal-logout');
        if (auth) await signOut(auth); 
        else window.location.reload(); 
    };

    if (auth) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid; 
                try {
                    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId);
                    const profileSnap = await getDoc(profileRef);
                    if (profileSnap.exists()) { 
                        const pData = profileSnap.data();
                        userName = pData.username || "Utilizador"; 
                        userAvatarUrl = pData.avatarUrl || "";
                        
                        document.getElementById('sidebar-account-name').innerText = userName; 
                        document.getElementById('profile-page-name').innerText = userName; 
                        
                        renderAvatarElement(document.getElementById('sidebar-user-avatar'), userName, userAvatarUrl);
                        renderAvatarElement(document.getElementById('top-user-avatar'), userName, userAvatarUrl);
                        renderAvatarElement(document.getElementById('profile-page-avatar'), userName, userAvatarUrl);

                        if(document.getElementById('btn-remover-foto-perfil')) {
                            document.getElementById('btn-remover-foto-perfil').style.display = (userAvatarUrl && userAvatarUrl.length > 5) ? 'inline-flex' : 'none';
                        }

                        if(pData.theme) aplicarTemaInterface(pData.theme);
                        if(pData.accentColor) aplicarCorInterface(pData.accentColor);
                        if(pData.allowLocation !== undefined) document.getElementById('switch-location').checked = pData.allowLocation;
                        if(pData.allowNotifications !== undefined) document.getElementById('switch-notifications').checked = pData.allowNotifications;
                    }
                } catch(e){}

                document.getElementById('auth-overlay').style.opacity = '0';
                setTimeout(() => { 
                    document.getElementById('auth-overlay').style.display = 'none'; 
                    document.getElementById('app-container').style.display = 'flex'; 
                    navegarMenu('menu-principal'); 
                }, 400);

                iniciarListenersFirebase();
            } else { 
                document.getElementById('auth-loading-state').style.display = 'none';
                document.getElementById('auth-box-form').style.display = 'block';
                document.getElementById('auth-overlay').style.display = 'flex';
                document.getElementById('auth-overlay').style.opacity = '1';
                document.getElementById('app-container').style.display = 'none'; 
            }
        });
    }

    function renderAvatarElement(elem, nome, urlFoto) {
        if(!elem) return;
        if(urlFoto && urlFoto.length > 5) {
            elem.innerHTML = `<img src="${urlFoto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            elem.innerHTML = `<span>${obterIniciaisNome(nome)}</span>`;
        }
    }

    window.togglePermissaoLocalizacao = async (checked) => {
        if(checked) {
            if(navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    () => window.mostrarAlerta("Localização concedida!"),
                    () => {
                        document.getElementById('switch-location').checked = false;
                        window.mostrarAlerta("Permissão de localização recusada.");
                    }
                );
            }
        }
        if(userId && db) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId), { allowLocation: document.getElementById('switch-location').checked }, { merge: true });
        }
    };

    window.togglePermissaoNotificacoes = async (checked) => {
        if(checked) {
            if ("Notification" in window) {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                    window.mostrarAlerta("Notificações Push ativadas!");
                } else {
                    document.getElementById('switch-notifications').checked = false;
                    window.mostrarAlerta("Permissão de Notificações recusada.");
                }
            }
        }
        if(userId && db) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId), { allowNotifications: document.getElementById('switch-notifications').checked }, { merge: true });
        }
    };

    window.abrirSidebar = () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('open'); };
    window.fecharSidebar = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); };
    window.toggleSubmenu = (idSub, idBase) => { const s = document.getElementById(idSub); if(s.style.display==='flex'){s.style.display='none'; if(idBase) navegarMenu(idBase);}else{s.style.display='flex';} };
    
    window.handleTopLeftClick = () => {
        const currentPage = pageHistory[pageHistory.length - 1];
        if(!mainPagesList.includes(currentPage)) {
            window.voltarAtras();
        } else {
            abrirSidebar();
        }
    };

    window.voltarAtras = () => {
        if(pageHistory.length > 1) {
            pageHistory.pop();
            const pageAnterior = pageHistory[pageHistory.length - 1];
            navegarMenu(pageAnterior, true);
        } else {
            navegarMenu('menu-principal', true);
        }
    };

    window.navegarMenu = (idPagina, isBack=false) => {
        window.fecharSidebar(); 
        if(!isBack && pageHistory[pageHistory.length-1] !== idPagina) pageHistory.push(idPagina);
        document.querySelectorAll('.nav-btn, .sidebar-item').forEach(b => b.classList.remove('active'));
        
        let bottomId = 'nav-btn-' + idPagina.replace('menu-','');
        if(document.getElementById(bottomId)) document.getElementById(bottomId).classList.add('active');
        if(document.getElementById('sidebtn-'+idPagina)) document.getElementById('sidebtn-'+idPagina).classList.add('active');
        
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        setTimeout(() => { const np = document.getElementById(idPagina); if(np){np.classList.add('active'); window.scrollTo(0,0);} }, 50);

        const topLeftBtn = document.getElementById('top-left-btn');
        const topTitle = document.getElementById('top-title');
        const gearContainer = document.getElementById('top-right-gear-container');

        if(idPagina === 'page-viagem-detalhe') {
            topLeftBtn.innerHTML = iconBackArrow;
            topTitle.innerText = currentTripDoc ? currentTripDoc.nome : 'Viagem';
            gearContainer.innerHTML = iconGear;
        } else if(!mainPagesList.includes(idPagina)) {
            topLeftBtn.innerHTML = iconBackArrow;
            topTitle.innerText = pageTitles[idPagina] || 'Menu';
            gearContainer.innerHTML = '';
        } else {
            topLeftBtn.innerHTML = `<div class="top-profile-avatar" id="top-user-avatar"></div>`;
            renderAvatarElement(document.getElementById('top-user-avatar'), userName, userAvatarUrl);
            topTitle.innerText = pageTitles[idPagina] || 'Início';
            gearContainer.innerHTML = '';
        }

        if(idPagina === 'menu-notificacoes') {
            marcarNotificacoesLidas();
        }
    };

    let touchStartX=0, touchStartY=0;
    document.addEventListener('touchstart', e => { touchStartX=e.changedTouches[0].screenX; touchStartY=e.changedTouches[0].screenY; }, {passive:true});
    document.addEventListener('touchend', e => {
        let diffX = e.changedTouches[0].screenX - touchStartX;
        if(Math.abs(diffX) > Math.abs(e.changedTouches[0].screenY - touchStartY)) {
            if(diffX > 60 && touchStartX < 50) { 
                const currentPage = pageHistory[pageHistory.length - 1];
                if(!mainPagesList.includes(currentPage)) {
                    voltarAtras();
                } else {
                    abrirSidebar(); 
                }
            }
            else if(diffX < -60) fecharSidebar();
        }
    }, {passive:true});

    const palette10 = ['#FF6B00','#FF3B30','#28CD41','#007AFF','#AF52DE','#FF2D55','#5AC8FA','#FFCC00','#5856D6','#2ECC71'];
    
    function renderColorPicker() {
        const grid = document.getElementById('color-picker-grid'); if(!grid) return; grid.innerHTML = ''; 
        const sColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        palette10.forEach(c => { 
            const circle = document.createElement('div'); circle.className = 'color-circle';
            if(c.toLowerCase() === sColor.toLowerCase()) circle.classList.add('selected');
            circle.style.backgroundColor = c; 
            circle.onclick = () => window.mudarCorApp(c);
            grid.appendChild(circle); 
        });
    }

    window.toggleGrelhaCores = () => {
        const g = document.getElementById('color-picker-grid');
        if(!g) return;
        renderColorPicker();
        g.style.display = (g.style.display === 'none' || g.style.display === '') ? 'grid' : 'none';
    };

    function aplicarCorInterface(nc) {
        document.documentElement.style.setProperty('--accent', nc);
        if(document.getElementById('cor-atual-bolinha')) document.getElementById('cor-atual-bolinha').style.backgroundColor = nc;
        renderColorPicker();
    }
    
    window.mudarCorApp = async (nc) => { 
        aplicarCorInterface(nc);
        if(userId && db) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId), { accentColor: nc }, { merge: true });
        }
    };

    function aplicarTemaInterface(tema) {
        const isL = (tema === 'light');
        if(isL) document.body.classList.add('light-mode');
        else document.body.classList.remove('light-mode');
        
        if(document.getElementById('texto-tema-modal')) document.getElementById('texto-tema-modal').innerText = isL ? 'Mudar para Modo Escuro' : 'Mudar para Modo Claro'; 
        if(document.getElementById('svg-moon')) document.getElementById('svg-moon').style.display = isL ? 'block' : 'none'; 
        if(document.getElementById('svg-sun')) document.getElementById('svg-sun').style.display = isL ? 'none' : 'block'; 
    }

    window.alternarTema = async () => {
        const novoTema = document.body.classList.contains('light-mode') ? 'dark' : 'light';
        aplicarTemaInterface(novoTema);
        if(userId && db) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', userId), { theme: novoTema }, { merge: true });
        }
    };

    function atualizarRelogio() { 
        const d = new Date(), ds = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"], nm = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; 
        if(document.getElementById('data-atual')) document.getElementById('data-atual').innerText = `${ds[d.getDay()]}, ${d.getDate()} ${nm[d.getMonth()]}`; 
        if(document.getElementById('hora-atual')) document.getElementById('hora-atual').innerText = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; 
    } 
    setInterval(atualizarRelogio, 1000); atualizarRelogio();
    
    const frases = [{t:"Entregue o seu caminho ao Senhor...",a:"Salmos 37:5"}, {t:"Tudo posso naquele que me fortalece.",a:"Filipenses 4:13"}, {t:"O amor é paciente, o amor é bondoso.",a:"1 Coríntios 13:4-7"}];
    const ind = Math.floor((new Date() - new Date(new Date().getFullYear(),0,0))/1000/60/60/24) % frases.length;
    document.getElementById('frase-texto').innerText = `"${frases[ind].t}"`; document.getElementById('frase-autor').innerText = frases[ind].a; 
    
    window.carregarMeteorologia = async (forcar) => {
        const req = async (lat, lon, nome) => { 
            try { 
                const res = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)).json(); 
                document.getElementById('meteo-temp').innerText = Math.round(res.current_weather.temperature)+"°"; document.getElementById('meteo-desc').innerText="Atualizado"; document.getElementById('nome-cidade-texto').innerText=nome; 
            } catch(e){ document.getElementById('meteo-desc').innerText="Sem dados"; } 
        };
        if(navigator.geolocation) navigator.geolocation.getCurrentPosition(async (pos) => { 
            try { 
                const geo = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=pt`)).json(); 
                req(pos.coords.latitude, pos.coords.longitude, geo.city || geo.locality || "Local"); 
            } catch(e){ req(pos.coords.latitude, pos.coords.longitude, "Local"); } 
        }, () => req(38.5244, -8.8882, "Setúbal")); else req(38.5244, -8.8882, "Setúbal");
    };
    setTimeout(() => window.carregarMeteorologia(), 500);

    function iniciarListenersFirebase() {
        if(!db || !userId) return; 
        unsusbscribes.forEach(f => f()); 
        unsusbscribes = []; 
        
        const userDocRef = doc(db, 'artifacts', appId, 'users', userId);
        
        const attachList = (col, ui) => unsusbscribes.push(onSnapshot(collection(userDocRef, col), s => {
            let arr = []; s.forEach(d => arr.push({id:d.id, ...d.data()})); 
            renderListDB(arr, ui, col);
        }));
        attachList('tarefas', 'container-tarefas'); 
        attachList('semanais', 'container-semanais'); 
        attachList('rapidas', 'container-rapidas');
        
        unsusbscribes.push(onSnapshot(collection(userDocRef, 'carros'), s => {
            carrosData = []; s.forEach(d => carrosData.push({id:d.id, ...d.data()}));
            renderCarrosDB(carrosData);
        }));

        unsusbscribes.push(onSnapshot(collection(userDocRef, 'notifications'), s => {
            let notifs = []; s.forEach(d => notifs.push({id:d.id, ...d.data()})); 
            renderNotificationsDB(notifs); 
        }));
        
        unsusbscribes.push(onSnapshot(collection(userDocRef, 'friends'), s => { minhaRede=[]; s.forEach(d => minhaRede.push({id:d.id, ...d.data()})); renderFriendsDB(minhaRede); }));

        unsusbscribes.push(onSnapshot(collection(userDocRef, 'livros_receitas'), s => {
            livrosReceitasData = []; s.forEach(d => livrosReceitasData.push({id:d.id, ...d.data()}));
            renderizarLivrosReceitasGrelha();
        }));

        unsusbscribes.push(onSnapshot(collection(userDocRef, 'documentos'), s => {
            documentosList = []; s.forEach(d => documentosList.push({id:d.id, ...d.data()}));
            renderizarDocumentosList();
        }));

        unsusbscribes.push(onSnapshot(collection(userDocRef, 'pastas_docs'), s => {
            pastasList = []; s.forEach(d => pastasList.push({id:d.id, ...d.data()}));
            renderizarPastasDocsList();
        }));

        const qViagens = query(
            collection(db, 'artifacts', appId, 'viagens_partilhadas'), 
            where("membros_uids", "array-contains", userId)
        );
        unsusbscribes.push(onSnapshot(qViagens, s => {
            viagensData = []; 
            s.forEach(d => viagensData.push({id:d.id, ...d.data()}));
            if(document.getElementById('stat-total-viagens')) document.getElementById('stat-total-viagens').innerText = viagensData.length; 
            
            const hoje = new Date().toISOString().split('T')[0];
            const proximas = viagensData.filter(v => v.dataInicio && v.dataInicio >= hoje).sort((a,b) => a.dataInicio.localeCompare(b.dataInicio));
            if(document.getElementById('stat-proxima-viagem')) {
                document.getElementById('stat-proxima-viagem').innerText = proximas.length > 0 ? proximas[0].nome : '--';
            }

            renderViagensCards(); 
            if(currentTripId){
                const tripAtual = viagensData.find(v => v.id === currentTripId);
                if(tripAtual){ 
                    currentTripDoc = tripAtual; 
                    if(document.getElementById('detalhe-viagem-titulo')) document.getElementById('detalhe-viagem-titulo').innerText = currentTripDoc.nome || '';
                    if(document.getElementById('detalhe-viagem-img')) document.getElementById('detalhe-viagem-img').src = currentTripDoc.capa || 'https://images.unsplash.com/photo-1488646953014-c8bf089f81d1';
                    if(document.getElementById('detalhe-viagem-datas')) document.getElementById('detalhe-viagem-datas').innerText = (currentTripDoc.dataInicio ? currentTripDoc.dataInicio : '') + (currentTripDoc.dataFim ? ' - ' + currentTripDoc.dataFim : '');
                    if(document.getElementById('detalhe-viagem-pessoas-count')) document.getElementById('detalhe-viagem-pessoas-count').innerText = `${currentTripDoc.membros_uids ? currentTripDoc.membros_uids.length : 1} pessoas`;
                    renderMembrosSettings(); 
                    atualizarResumoInternoViagem();
                }
            }
        }, err => {
            console.error("Erro Viagens:", err);
            window.mostrarAlerta("Erro a obter viagens: " + err.message);
        }));
    }

    async function criarNotificacaoDB(targetUid, texto) {
        if(!targetUid) return;
        const agora = new Date();
        const dataStr = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()}`;
        const horaStr = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;
        
        await addDoc(collection(db, 'artifacts', appId, 'users', targetUid, 'notifications'), {
            texto: texto,
            dataStr: dataStr,
            horaStr: horaStr,
            lida: false,
            timestamp: Date.now()
        });
    }

    function renderNotificationsDB(notifs) {
        const c = document.getElementById('container-pedidos');
        const badge = document.getElementById('badge-notificacoes-bottom');
        
        notifs.sort((a,b) => b.timestamp - a.timestamp);
        const naoLidas = notifs.filter(n => !n.lida).length;

        if(naoLidas > 0) {
            badge.innerText = naoLidas;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }

        if(notifs.length === 0) {
            c.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:13px;">Sem notificações.</p>';
            return;
        }

        const hojeStr = new Date().toLocaleDateString('pt-PT');

        let html = '';
        notifs.forEach(n => {
            let dataNotif = new Date(n.timestamp || Date.now());
            let isHoje = dataNotif.toLocaleDateString('pt-PT') === hojeStr;
            let displayTime = isHoje ? (n.horaStr || 'Agora') : (n.dataStr || 'Outras datas');

            html += `<div class="notif-push-card">
                <div class="notif-push-header">
                    <div class="notif-push-brand">
                        <img src="logopreto_fundobranco.png" class="notif-push-app-icon" onerror="this.src='logobranco_semfundo.png'">
                        <span class="notif-push-app-name">Gestão G&N</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="notif-push-time">${displayTime}</span>
                        <button class="btn-icon-list" onclick="apagarNotificacaoDB('${n.id}')">${iconTrash}</button>
                    </div>
                </div>
                <div class="notif-push-body">${n.texto}</div>
            </div>`;
        });
        c.innerHTML = html;
    }

    async function marcarNotificacoesLidas() {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'users', userId, 'notifications'));
        snap.forEach(d => {
            if(!d.data().lida) {
                updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notifications', d.id), { lida: true });
            }
        });
    }

    window.apagarNotificacaoDB = async (notifId) => {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'notifications', notifId));
    };

    function renderListDB(arr, ui, col) { 
        arr.sort((a,b) => (a.timestamp||0)-(b.timestamp||0)); let h='';
        arr.forEach(i => h+=`<div class="list-item ${i.feita?'feita':''}"><div class="checkbox-custom" onclick="toggleItemDB('${col}','${i.id}',${!i.feita})"></div><span class="item-texto" onclick="toggleItemDB('${col}','${i.id}',${!i.feita})">${i.texto}</span><button class="btn-icon-list" onclick="apagarItemDB('${col}','${i.id}')">${iconTrash}</button></div>`); 
        document.getElementById(ui).innerHTML = h;
    }
    
    window.adicionarItemDB = async (col, idInp) => { const txt = document.getElementById(idInp).value.trim(); if(txt){ await addDoc(collection(db,'artifacts',appId,'users',userId,col), {texto:txt, feita:false, timestamp:Date.now()}); document.getElementById(idInp).value=''; } };
    window.toggleItemDB = async (col, docId, est) => await updateDoc(doc(db,'artifacts',appId,'users',userId,col,docId), {feita:est}); 
    window.apagarItemDB = async (col, docId) => await deleteDoc(doc(db,'artifacts',appId,'users',userId,col,docId));

    /* GARAGEM REESTRUTURADA */
    window.adicionarCarroDB = async () => {
        const nome = document.getElementById('input-carro-nome').value.trim();
        const mat = document.getElementById('input-carro-mat').value.trim();
        if(!nome) return window.mostrarAlerta("Preenche pelo menos o nome/modelo do veículo.");
        
        await addDoc(collection(db,'artifacts',appId,'users',userId,'carros'), { 
            nome: nome, 
            matricula: mat, 
            foto: tempCarFoto || "",
            timestamp: Date.now() 
        });
        
        document.getElementById('input-carro-nome').value = '';
        document.getElementById('input-carro-mat').value = '';
        document.getElementById('preview-car-photo').style.display = 'none';
        document.getElementById('msg-sem-car-photo').style.display = 'block';
        tempCarFoto = "";
        
        window.voltarAtras();
    };

    function renderCarrosDB(carros) {
        const c = document.getElementById('container-lista-carros');
        if(!c) return;
        if(carros.length === 0) { c.innerHTML = '<p style="text-align:center;font-size:12px;color:var(--text-muted);padding:20px 0;">Sem veículos registados. Clica em "+ Adicionar Veículo".</p>'; return; }
        let h = '';
        carros.forEach(car => {
            h += `<div class="car-card-item" onclick="abrirDetalheCarro('${car.id}')">
                <img src="${car.foto || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf'}" class="car-card-img">
                <div class="car-card-info">
                    <div>
                        <div style="font-weight:600;font-size:15px;">${car.nome}</div>
                        ${car.matricula ? `<div style="font-size:12px;color:var(--text-muted);">${car.matricula}</div>` : ''}
                    </div>
                    <button class="btn-icon-list" onclick="event.stopPropagation(); apagarCarroDB('${car.id}')">${iconTrash}</button>
                </div>
            </div>`;
        });
        c.innerHTML = h;
    }

    window.abrirDetalheCarro = (id) => {
        currentCarroId = id;
        const carro = carrosData.find(c => c.id === id);
        if(!carro) return;

        document.getElementById('detalhe-carro-nome').innerText = carro.nome;
        document.getElementById('detalhe-carro-mat').innerText = carro.matricula || 'Sem matrícula';
        document.getElementById('detalhe-carro-img').src = carro.foto || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf';

        window.navegarMenu('page-detalhe-carro');

        onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'carros', id, 'documentos'), s => {
            carDocsList = []; s.forEach(d => carDocsList.push({id:d.id, ...d.data()}));
            renderizarCarDocs();
        });

        onSnapshot(collection(db, 'artifacts', appId, 'users', userId, 'carros', id, 'pastas'), s => {
            carPastasList = []; s.forEach(d => carPastasList.push({id:d.id, ...d.data()}));
            renderizarCarPastas();
        });
    };

    window.criarPastaCarro = async () => {
        const nome = document.getElementById('input-nome-pasta-carro').value.trim();
        if(!nome || !currentCarroId) return;
        await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'carros', currentCarroId, 'pastas'), {
            nome: nome,
            timestamp: Date.now()
        });
        fecharModal('modal-criar-pasta-carro');
        document.getElementById('input-nome-pasta-carro').value = '';
    };

    window.uploadDocumentoCarro = async (ev) => {
        const file = ev.target.files[0];
        if(!file || !currentCarroId) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'carros', currentCarroId, 'documentos'), {
                nome: file.name,
                tipo: file.type,
                conteudo: e.target.result,
                timestamp: Date.now()
            });
            window.mostrarAlerta(`Ficheiro "${file.name}" associado ao veículo com sucesso.`);
        };
        reader.readAsDataURL(file);
    };

    function renderizarCarPastas() {
        const c = document.getElementById('container-pastas-carro');
        if(!c) return;
        let h = '';
        carPastasList.forEach(p => {
            h += `<div class="btn-acao" style="font-size:12px;justify-content:space-between;">
                <span>📁 ${p.nome}</span>
                <button class="btn-icon-list" onclick="apagarPastaCarro('${p.id}')">${iconTrash}</button>
            </div>`;
        });
        c.innerHTML = h;
    }

    function renderizarCarDocs() {
        const c = document.getElementById('container-docs-carro');
        if(!c) return;
        if(carDocsList.length === 0) {
            c.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:12px;">Sem ficheiros anexados a este veículo.</p>';
            return;
        }
        let h = '';
        carDocsList.forEach(d => {
            h += `<div class="doc-item-card">
                <svg class="icon-svg" style="width:20px;height:20px;margin:0;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <div style="flex:1;overflow:hidden;">
                    <div style="font-size:13px;font-weight:600;" class="expense-title-txt">${d.nome}</div>
                </div>
                <button class="btn-icon-list" onclick="apagarDocCarro('${d.id}')">${iconTrash}</button>
            </div>`;
        });
        c.innerHTML = h;
    }

    window.apagarPastaCarro = async (pId) => {
        if(confirm("Apagar pasta do veículo?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'carros', currentCarroId, 'pastas', pId));
    };

    window.apagarDocCarro = async (dId) => {
        if(confirm("Apagar documento do veículo?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'carros', currentCarroId, 'documentos', dId));
    };

    window.partilharCarroAtual = () => {
        window.mostrarAlerta("Documentos do Veículo partilhados com a tua rede de amigos.");
    };

    window.apagarCarroDB = async (carId) => {
        if(confirm("Remover este veículo?")) await deleteDoc(doc(db,'artifacts',appId,'users',userId,'carros',carId));
    };

    const lojas = [ {id:'continente',nome:'Continente',logo:'https://upload.wikimedia.org/wikipedia/commons/f/fd/Logo_Continente.svg',link:'https://folhetos.continente.pt/'}, {id:'pingodoce',nome:'Pingo Doce',logo:'https://upload.wikimedia.org/wikipedia/en/d/de/Pingo_Doce_logo.svg',link:'https://www.pingodoce.pt/folhetos/'}, {id:'lidl',nome:'Lidl',logo:'https://upload.wikimedia.org/wikipedia/commons/1/1d/Lidl_logo.png',link:'https://www.lidl.pt/folhetos'}, {id:'auchan',nome:'Auchan',logo:'https://upload.wikimedia.org/wikipedia/commons/6/6e/Auchan_Retail_logo.svg',link:'https://www.auchan.pt/pt/folhetos/'}, {id:'intermarche',nome:'Intermarché',logo:'https://upload.wikimedia.org/wikipedia/commons/9/96/Intermarch%C3%A9_logo_2009_classic.svg',link:'https://www.intermarche.pt/folhetos/'} ];
    let hl=''; lojas.forEach(l => hl+=`<div class="logo-card" onclick="abrirDetalheSupermercado('${l.id}')"><img src="${l.logo}"></div>`); document.getElementById('container-logos').innerHTML=hl;
    
    window.abrirDetalheSupermercado = async (id) => {
        currentSuperId = id; const l = lojas.find(x => x.id === id); document.getElementById('detalhe-nome').innerText = l.nome; document.getElementById('btn-ver-folheto').onclick = () => window.open(l.link, '_blank');
        const img = document.getElementById('detalhe-cartao-img'), txt = document.getElementById('msg-sem-cartao'); img.style.display='none'; img.src=''; txt.style.display='block'; document.getElementById('detalhe-obs').value="";
        if(userId && db){ try{ const r = await getDoc(doc(db,'artifacts',appId,'users',userId,'supermercados',id)); if(r.exists()){ const d = r.data(); if(d.notas) document.getElementById('detalhe-obs').value=d.notas; if(d.cartao_img){img.src=d.cartao_img; img.style.display='block'; txt.style.display='none';} } }catch(e){} } 
        window.navegarMenu('page-super-detail');
    };
    
    window.guardarObservacaoSuperDB = async () => await setDoc(doc(db,'artifacts',appId,'users',userId,'supermercados',currentSuperId), {notas:document.getElementById('detalhe-obs').value}, {merge:true});
    window.cliqueCartao = () => { const i=document.getElementById('detalhe-cartao-img'); if(i.style.display!=='none' && i.src){ document.getElementById('img-fullscreen-cartao').src=i.src; window.abrirModal('modal-cartao'); } else document.getElementById('input-foto-cartao').click(); };
    
    window.processarFotoCartao = (ev) => { 
        const file = ev.target.files[0]; if(!file) return; 
        const reader = new FileReader(); reader.onload = (e) => { 
            const img = new Image(); img.onload = async () => { 
                const canvas = document.createElement('canvas'); const max = 800; let w=img.width, h=img.height; 
                if(w>h){if(w>max){h*=max/w; w=max;}}else{if(h>max){w*=max/h; h=max;}} canvas.width=w; canvas.height=h; 
                canvas.getContext('2d').drawImage(img,0,0,w,h); const b64 = canvas.toDataURL('image/jpeg',0.6); 
                document.getElementById('detalhe-cartao-img').src=b64; document.getElementById('detalhe-cartao-img').style.display='block'; document.getElementById('msg-sem-cartao').style.display='none'; 
                await setDoc(doc(db,'artifacts',appId,'users',userId,'supermercados',currentSuperId), {cartao_img:b64}, {merge:true}); 
            }; img.src = e.target.result; 
        }; reader.readAsDataURL(file); 
    };

    window.pesquisarUtilizadores = async () => { 
        const t = document.getElementById('input-search-users').value.toLowerCase(), c = document.getElementById('container-pesquisa-users'); 
        if(t.length < 2) { c.innerHTML=''; return; } c.innerHTML='<p style="text-align:center;font-size:12px;">A procurar...</p>'; 
        const res = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'profiles')); let arr=[]; 
        res.forEach(d => { let p=d.data(); if(p.uid!==userId && p.searchName && p.searchName.includes(t)) arr.push(p); }); 
        if(arr.length===0){c.innerHTML='<p style="text-align:center;font-size:12px;">Ninguém encontrado.</p>'; return;} 
        let h=''; arr.forEach(u => h+=`<div class="user-card"><div class="user-info"><div class="user-avatar-custom" style="width:30px;height:30px;font-size:12px;">${obterIniciaisNome(u.username)}</div><p class="user-name" style="font-size:13px;">${u.username}</p></div><button class="btn-add" style="width:auto;padding:5px 15px;font-size:12px;" onclick="enviarPedido('${u.uid}', '${u.username}')">Adicionar</button></div>`); c.innerHTML=h;
    };
    
    window.enviarPedido = async (id, nm) => { 
        await setDoc(doc(db,'artifacts',appId,'users',id,'requests',userId), {fromUid:userId, fromName:userName, timestamp:Date.now()}); 
        await criarNotificacaoDB(id, `${userName} enviou-te um pedido de amizade.`);
        window.mostrarAlerta(nm+" convidado!"); 
        document.getElementById('input-search-users').value=''; 
        document.getElementById('container-pesquisa-users').innerHTML=''; 
    };

    function renderFriendsDB(amigos) { 
        const c = document.getElementById('container-amigos'); 
        if(document.getElementById('profile-friends-count')) document.getElementById('profile-friends-count').innerText = amigos.length;
        if(amigos.length===0){c.innerHTML='<p style="text-align:center;font-size:12px;color:var(--text-muted);">Ainda não adicionaste ninguém.</p>'; return;} 
        let h=''; 
        amigos.forEach(a => {
            h+=`<div class="user-card" style="justify-content:flex-start;gap:12px;"><div class="user-avatar-custom" style="width:34px;height:34px;font-size:12px;flex-shrink:0;">`;
            if(a.avatarUrl) {
                h+=`<img src="${a.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                h+=obterIniciaisNome(a.name);
            }
            h+=`</div><p class="user-name" style="margin:0;font-size:14px;font-weight:500;">${a.name}</p></div>`;
        }); 
        c.innerHTML=h; 
    }

    /* DOCUMENTOS */
    window.switchDocTab = (tab) => {
        document.getElementById('tab-doc-meus').classList.toggle('active', tab === 'meus');
        document.getElementById('tab-doc-partilhados').classList.toggle('active', tab === 'partilhados');
    };

    window.criarPastaDocumentos = async () => {
        const nome = document.getElementById('input-nome-pasta').value.trim();
        if(!nome) return;
        await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'pastas_docs'), {
            nome: nome,
            timestamp: Date.now()
        });
        fecharModal('modal-criar-pasta');
        document.getElementById('input-nome-pasta').value = '';
    };

    window.uploadDocumento = async (ev) => {
        const file = ev.target.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'documentos'), {
                nome: file.name,
                tipo: file.type,
                conteudo: e.target.result,
                timestamp: Date.now()
            });
            window.mostrarAlerta(`Documento "${file.name}" guardado com sucesso!`);
        };
        reader.readAsDataURL(file);
    };

    function renderizarPastasDocsList() {
        const c = document.getElementById('container-pastas-docs');
        let h = '';
        pastasList.forEach(p => {
            h += `<div class="btn-acao" style="font-size:12px;">📁 ${p.nome}</div>`;
        });
        c.innerHTML = h;
    }

    function renderizarDocumentosList() {
        const c = document.getElementById('container-lista-docs');
        if(documentosList.length === 0) {
            c.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:12px;">Sem ficheiros guardados.</p>';
            return;
        }
        let h = '';
        documentosList.forEach(d => {
            h += `<div class="doc-item-card">
                <svg class="icon-svg" style="width:20px;height:20px;margin:0;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <div style="flex:1;overflow:hidden;">
                    <div style="font-size:13px;font-weight:600;" class="expense-title-txt">${d.nome}</div>
                </div>
                <button class="btn-icon-list" onclick="apagarDocumento('${d.id}')">${iconTrash}</button>
            </div>`;
        });
        c.innerHTML = h;
    }

    window.apagarDocumento = async (id) => {
        if(confirm("Remover documento?")) await deleteDoc(doc(db,'artifacts',appId,'users',userId,'documentos',id));
    };

    /* MÓDULO LIVRO DE RECEITAS */
    function renderizarLivrosReceitasGrelha() {
        const c = document.getElementById('container-grid-livros-receitas');
        if(!c) return;

        if(livrosReceitasData.length === 0) {
            c.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0;">Nenhum livro criado. Clica em "+ Criar Livro"!</p>';
            return;
        }

        let html = '';
        livrosReceitasData.forEach(livro => {
            html += `<div class="book-cover-card" onclick="abrirLivroReceitas('${livro.id}')">
                <img src="${livro.capa || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352'}" class="book-cover-img">
                <div class="book-cover-title">${livro.nome}</div>
            </div>`;
        });
        c.innerHTML = html;
    }

    window.criarNovoLivroReceita = async () => {
        const nome = document.getElementById('input-nome-livro').value.trim();
        if(!nome) return;

        await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'livros_receitas'), {
            nome: nome,
            capa: tempCapaLivroUrl || "https://images.unsplash.com/photo-1495521821757-a1efb6729352",
            categorias: [],
            timestamp: Date.now()
        });

        fecharModal('modal-criar-livro-receita');
        document.getElementById('input-nome-livro').value = '';
        document.getElementById('preview-capa-livro-nova').style.display = 'none';
        document.getElementById('msg-sem-capa-livro').style.display = 'block';
        tempCapaLivroUrl = "";
    };

    window.abrirLivroReceitas = async (livroId) => {
        currentLivroId = livroId;
        const livro = livrosReceitasData.find(l => l.id === livroId);
        categoriasIndiceLivro = livro ? (livro.categorias || []) : [];
        
        document.getElementById('receitas-view-livros').style.display = 'none';
        document.getElementById('receitas-view-reader').style.display = 'block';

        const qRec = collection(db, 'artifacts', appId, 'users', userId, 'livros_receitas', livroId, 'itens');
        onSnapshot(qRec, s => {
            receitasLivroAtual = [];
            s.forEach(d => receitasLivroAtual.push({id:d.id, ...d.data()}));
            currentRecipePageIndex = 0;
            renderizarPaginaAtualLivro();
        });
    };

    window.fecharLivroReceitas = () => {
        document.getElementById('receitas-view-reader').style.display = 'none';
        document.getElementById('receitas-view-livros').style.display = 'block';
    };

    function renderizarPaginaAtualLivro() {
        const c = document.getElementById('recipe-page-content-inside');
        const pageNum = document.getElementById('recipe-reader-page-num');
        
        if(currentRecipePageIndex === 0) {
            pageNum.innerText = "Índice do Livro";
            let catsHtml = '';
            categoriasIndiceLivro.forEach(cat => {
                catsHtml += `<div class="list-item" style="background:#F2F2F2;color:#121212;border:none;"><span>📌 ${cat}</span></div>`;
            });

            c.innerHTML = `
                <h2 style="font-size:22px;font-weight:700;color:#121212;margin-bottom:15px;text-align:center;">📖 ÍNDICE</h2>
                <div style="display:flex;gap:8px;margin-bottom:15px;">
                    <input type="text" id="input-nova-cat-indice" class="input-text" style="background:#fff;color:#121212;border:1px solid #ccc;" placeholder="Nova Categoria...">
                    <button class="btn-add" onclick="adicionarCategoriaIndice()">+</button>
                </div>
                <div class="lista-itens">${catsHtml || '<p style="font-size:12px;color:#777;text-align:center;">Sem categorias. Adiciona acima!</p>'}</div>
            `;
            return;
        }

        const rIndex = currentRecipePageIndex - 1;
        if(receitasLivroAtual.length === 0 || !receitasLivroAtual[rIndex]) {
            c.innerHTML = '<p style="text-align:center;color:#666;font-size:14px;padding-top:100px;">Nenhuma receita nesta página.</p>';
            pageNum.innerText = "Página Vazia";
            return;
        }

        const r = receitasLivroAtual[rIndex];
        pageNum.innerText = `Página ${currentRecipePageIndex} de ${receitasLivroAtual.length}`;

        c.innerHTML = `
            ${r.foto ? `<img src="${r.foto}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:12px;">` : ''}
            <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;">${r.categoria || 'Geral'}</span>
            <h2 style="font-size:20px;font-weight:700;color:#121212;margin:2px 0 10px 0;text-align:left;">${r.titulo}</h2>
            <div style="font-size:12px;color:#555;margin-bottom:10px;">⏱️ ${r.tempo || 'N/D'}</div>
            
            <div class="recipe-content-wrapper">
                <strong style="font-size:13px;display:block;margin-bottom:4px;color:#121212;">Ingredientes:</strong>
                <p style="font-size:12px;color:#333;white-space:pre-line;margin:0 0 10px 0;">${r.ingredientes || 'Sem ingredientes'}</p>
                <strong style="font-size:13px;display:block;margin-bottom:4px;color:#121212;">Preparação:</strong>
                <p style="font-size:12px;color:#333;white-space:pre-line;margin:0;">${r.preparo || 'Sem preparação'}</p>
            </div>
        `;
    }

    window.adicionarCategoriaIndice = async () => {
        const inp = document.getElementById('input-nova-cat-indice');
        const novaCat = inp.value.trim();
        if(!novaCat) return;

        categoriasIndiceLivro.push(novaCat);
        await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'livros_receitas', currentLivroId), {
            categorias: categoriasIndiceLivro
        });
        inp.value = '';
        renderizarPaginaAtualLivro();
    };

    window.folhearPaginaReceita = (direcao) => {
        const totalPaginas = receitasLivroAtual.length + 1;
        if(direcao === 1 && currentRecipePageIndex < totalPaginas - 1) {
            currentRecipePageIndex++;
            renderizarPaginaAtualLivro();
        } else if(direcao === -1 && currentRecipePageIndex > 0) {
            currentRecipePageIndex--;
            renderizarPaginaAtualLivro();
        }
    };

    window.abrirModalNovaReceita = () => {
        if(!currentLivroId) return window.mostrarAlerta("Abre um livro para adicionar receitas.");
        
        const catBox = document.getElementById('container-select-categoria-receita-box');
        const catSelect = document.getElementById('select-recipe-categoria');

        if(categoriasIndiceLivro && categoriasIndiceLivro.length > 0) {
            let options = '';
            categoriasIndiceLivro.forEach(c => options += `<option value="${c}">${c}</option>`);
            catSelect.innerHTML = options;
            catBox.style.display = 'block';
        } else {
            catBox.style.display = 'none';
        }

        abrirModal('modal-nova-receita');
    };

    window.processarFotoReceita = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            tempRecipeFoto = e.target.result;
            document.getElementById('preview-recipe-foto').src = tempRecipeFoto;
            document.getElementById('preview-recipe-foto').style.display = 'block';
            document.getElementById('msg-sem-recipe-foto').style.display = 'none';
        };
        reader.readAsDataURL(file);
    };

    window.guardarNovaReceita = async () => {
        const tit = document.getElementById('input-recipe-titulo').value.trim();
        const tempo = document.getElementById('input-recipe-tempo').value.trim();
        
        let cat = "Geral";
        if(categoriasIndiceLivro && categoriasIndiceLivro.length > 0) {
            cat = document.getElementById('select-recipe-categoria').value;
        }

        const ing = document.getElementById('input-recipe-ingredientes').value.trim();
        const prep = document.getElementById('input-recipe-preparo').value.trim();
        const obs = document.getElementById('input-recipe-obs').value.trim();

        if(!tit) return window.mostrarAlerta("Insere pelo menos o título da receita.");

        await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'livros_receitas', currentLivroId, 'itens'), {
            titulo: tit,
            tempo: tempo,
            categoria: cat,
            ingredientes: ing,
            preparo: prep,
            obs: obs,
            foto: tempRecipeFoto || "",
            timestamp: Date.now()
        });

        fecharModal('modal-nova-receita');
        document.getElementById('input-recipe-titulo').value = '';
        document.getElementById('input-recipe-tempo').value = '';
        document.getElementById('input-recipe-ingredientes').value = '';
        document.getElementById('input-recipe-preparo').value = '';
        document.getElementById('input-recipe-obs').value = '';
        document.getElementById('preview-recipe-foto').style.display = 'none';
        tempRecipeFoto = "";
    };

    window.partilharLivroAtual = () => {
        window.mostrarAlerta("Link do Livro copiado!");
    };

    window.verCapaViagemEmGrande = () => {
        const img = document.getElementById('detalhe-viagem-img');
        if(img && img.src) {
            document.getElementById('img-fullscreen-cartao').src = img.src;
            abrirModal('modal-cartao');
        }
    };

    /* VIAGENS */
    function renderViagensCards() { 
        const c = document.getElementById('container-viagens'); if(viagensData.length===0){c.innerHTML='<p style="text-align:center;font-size:13px;color:var(--text-muted);">Sem viagens.</p>'; return;} 
        viagensData.sort((a,b) => (b.timestamp||0)-(a.timestamp||0)); let h='';
        
        const svgGroup = `<svg class="icon-svg" style="width:16px;height:16px;margin:0;color:var(--accent);" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;

        viagensData.forEach(v => {
            let datasTxt = (v.dataInicio ? v.dataInicio : '') + (v.dataFim ? ' - ' + v.dataFim : '');
            let isPartilhada = (v.membros_uids && v.membros_uids.length > 1);

            h+=`<div class="trip-card" onclick="abrirDetalheViagem('${v.id}')">
                <img class="trip-cover" src="${v.capa||'https://images.unsplash.com/photo-1488646953014-c8bf089f81d1'}">
                <div class="trip-overlay">
                    <h4 class="trip-title">${v.nome||'Sem Título'}</h4>
                    <span class="trip-country">
                        <span>${v.paisCode||''} • ${datasTxt || 'Sem datas'}</span>
                        ${isPartilhada ? svgGroup : ''}
                    </span>
                </div>
            </div>`; 
        });
        c.innerHTML=h; 
    }
    
    window.guardarNovaViagem = async () => {
        try {
            const tit = document.getElementById('input-viagem-nome').value.trim();
            const dest = document.getElementById('input-viagem-destino').value.trim();
            const dtInicio = document.getElementById('input-viagem-data-inicio').value;
            const dtFim = document.getElementById('input-viagem-data-fim').value;

            if(!tit || !dest) return window.mostrarAlerta("Preenche o título e o destino."); 
            const btn = document.getElementById('btn-save-viagem'); btn.innerText="A guardar..."; btn.disabled=true;
            
            await addDoc(collection(db, 'artifacts', appId, 'viagens_partilhadas'), { 
                nome: tit, 
                paisCode: dest, 
                dataInicio: dtInicio,
                dataFim: dtFim,
                capa: tempCapaUrl||"", 
                timestamp: Date.now(), 
                membros_uids: [userId], 
                membros_info: [{uid:userId, nome:userName||"Eu", avatarUrl:userAvatarUrl}], 
                dono: userId 
            });
            
            document.getElementById('input-viagem-nome').value=''; document.getElementById('input-viagem-destino').value=''; 
            document.getElementById('input-viagem-data-inicio').value=''; document.getElementById('input-viagem-data-fim').value=''; 
            document.getElementById('preview-capa-viagem').style.display='none'; document.getElementById('msg-sem-capa').style.display='block'; tempCapaUrl=""; 
            btn.innerText="Guardar Viagem"; btn.disabled=false; window.navegarMenu('menu-viagens');
        } catch(e){ window.mostrarAlerta("Erro a guardar: " + e.message); const btn = document.getElementById('btn-save-viagem'); if(btn){btn.innerText="Guardar Viagem"; btn.disabled=false;} }
    };

    window.switchTripTab = (n) => { 
        document.querySelectorAll('.trip-tab').forEach(e=>e.classList.remove('active')); 
        document.getElementById('tab-btn-'+n).classList.add('active'); 
        document.querySelectorAll('.trip-tab-content').forEach(e=>e.classList.remove('active')); 
        document.getElementById('tab-'+n).classList.add('active'); 
    };
    
    let unsubDespesas = null;
    let unsubTimeline = null;

    /* ABERTURA TOTALMENTE DEFENSIVA E ROBUSTA DAS VIAGENS */
    window.abrirDetalheViagem = (id) => {
        currentTripId = id; 
        currentTripDoc = viagensData.find(v => v.id === id); 
        if(!currentTripDoc) return;

        const elTit = document.getElementById('detalhe-viagem-titulo');
        if(elTit) elTit.innerText = currentTripDoc.nome || '';
        
        const elImg = document.getElementById('detalhe-viagem-img');
        if(elImg) elImg.src = currentTripDoc.capa || 'https://images.unsplash.com/photo-1488646953014-c8bf089f81d1';
        
        const elDatas = document.getElementById('detalhe-viagem-datas');
        if(elDatas) elDatas.innerText = (currentTripDoc.dataInicio ? currentTripDoc.dataInicio : '') + (currentTripDoc.dataFim ? ' - ' + currentTripDoc.dataFim : '');
        
        const elCount = document.getElementById('detalhe-viagem-pessoas-count');
        if(elCount) {
            elCount.innerText = `${currentTripDoc.membros_uids ? currentTripDoc.membros_uids.length : 1} pessoas`;
        }

        const inNome = document.getElementById('edit-trip-nome');
        if(inNome) inNome.value = currentTripDoc.nome || '';
        
        const inDest = document.getElementById('edit-trip-destino');
        if(inDest) inDest.value = currentTripDoc.paisCode || '';
        
        const inIni = document.getElementById('edit-trip-data-inicio');
        if(inIni) inIni.value = currentTripDoc.dataInicio || '';
        
        const inFim = document.getElementById('edit-trip-data-fim');
        if(inFim) inFim.value = currentTripDoc.dataFim || '';

        const elNotes = document.getElementById('trip-detalhes-notes-text');
        if(elNotes) elNotes.value = currentTripDoc.notasGerais || '';

        renderMembrosSettings(); 
        window.switchTripTab('resumo'); 
        window.navegarMenu('page-viagem-detalhe');
        
        if(unsubDespesas) unsubDespesas();
        unsubDespesas = onSnapshot(collection(db,'artifacts',appId,'viagens_partilhadas',id,'despesas'), s => { 
            despesasData = []; s.forEach(d => despesasData.push({id:d.id, ...d.data()})); 
            renderizarDespesas(despesasData); 
            atualizarResumoInternoViagem(despesasData);
            renderizarGraficosResumo(despesasData);
        });

        if(unsubTimeline) unsubTimeline();
        unsubTimeline = onSnapshot(collection(db,'artifacts',appId,'viagens_partilhadas',id,'timeline'), s => { 
            timelineEventsData = []; 
            s.forEach(d => timelineEventsData.push({id:d.id, ...d.data()})); 
            renderizarTimelineEvents(); 
            atualizarResumoInternoViagem();
        });
    };

    window.guardarNotasGeraisViagem = async () => {
        const txt = document.getElementById('trip-detalhes-notes-text').value;
        if(currentTripId) {
            await updateDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId), { notasGerais: txt });
        }
    };

    window.guardarAlteracoesViagem = async () => {
        const novoNome = document.getElementById('edit-trip-nome').value.trim();
        const novoDestino = document.getElementById('edit-trip-destino').value.trim();
        const novaDataInicio = document.getElementById('edit-trip-data-inicio').value;
        const novaDataFim = document.getElementById('edit-trip-data-fim').value;

        if(!novoNome) return window.mostrarAlerta("Insere um título válido.");

        await updateDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId), {
            nome: novoNome,
            paisCode: novoDestino,
            dataInicio: novaDataInicio,
            dataFim: novaDataFim
        });

        window.voltarAtras();
    };
    
    window.apagarViagem = async () => { 
        if(confirm("Apagar esta viagem permanentemente?")) { 
            await deleteDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId)); 
            window.navegarMenu('menu-viagens'); 
        } 
    };

    function renderMembrosSettings() {
         let sel='', list='', dd='', checkboxes = '';
         const donoId = currentTripDoc ? currentTripDoc.dono : null;

         if(currentTripDoc && currentTripDoc.membros_info) {
             currentTripDoc.membros_info.forEach(p => { 
                 sel+=`<option value="${p.uid}">${p.nome}</option>`; 
                 
                 let isCriador = (p.uid === donoId);
                 let btnRemover = (!isCriador && (userId === donoId || p.uid === userId)) ? 
                    `<button class="btn-icon-list" onclick="removerMembroViagem('${p.uid}')" title="Remover das viagens">${iconTrash}</button>` : '';

                 list+=`<div class="user-card" style="padding:10px;">
                    <div class="user-info">
                        <div class="user-avatar-custom" style="width:30px;height:30px;font-size:12px;flex-shrink:0;">`;
                 if(p.avatarUrl) {
                     list+=`<img src="${p.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                 } else {
                     list+=obterIniciaisNome(p.nome);
                 }
                 list+=`</div>
                        <div>
                            <span style="font-size:14px;font-weight:500;">${p.nome}</span>
                            ${isCriador ? '<span style="font-size:10px;color:var(--accent);margin-left:6px;font-weight:600;">(Criador)</span>' : ''}
                        </div>
                    </div>
                    ${btnRemover}
                 </div>`; 

                 checkboxes += `<div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:6px;">
                    <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" class="chk-split-membro" value="${p.uid}" checked onchange="alternarModoDivisaoUI()"> ${p.nome}
                    </label>
                    <input type="number" class="val-split-exato auth-input" data-uid="${p.uid}" placeholder="€" style="display:none;width:80px;margin:0;padding:4px 8px;font-size:12px;">
                 </div>`;
             });
         }

         if(document.getElementById('exp-pagador')) document.getElementById('exp-pagador').innerHTML = sel; 
         if(document.getElementById('trip-membros-list')) document.getElementById('trip-membros-list').innerHTML = list;
         if(document.getElementById('split-participantes-container')) document.getElementById('split-participantes-container').innerHTML = checkboxes;

         let conv=false; 
         minhaRede.forEach(c => { 
             if(currentTripDoc && !currentTripDoc.membros_uids.includes(c.uid)){ 
                 dd+=`<option value="${c.uid}" data-nome="${c.name}">${c.name}</option>`; 
                 conv=true; 
             } 
         });
         if(document.getElementById('trip-amigos-disponiveis')) document.getElementById('trip-amigos-disponiveis').innerHTML = conv ? dd : '<option value="">Todos já adicionados!</option>';
    }

    window.alternarModoDivisaoUI = () => {
        const modo = document.getElementById('exp-modo-divisao').value;
        document.querySelectorAll('.val-split-exato').forEach(inp => {
            inp.style.display = (modo === 'exatos') ? 'block' : 'none';
        });
    };

    window.alterarModoDespesasSelect = (val) => {
        modoDespesasAtivo = val;
        if(document.getElementById('btn-liquidar-split-only')) document.getElementById('btn-liquidar-split-only').style.display = (val === 'splitwise') ? 'inline-flex' : 'none';
        
        const containerSplitBox = document.getElementById('container-campos-splitwise-mode');
        const splitParticipantesBox = document.getElementById('split-participantes-container');
        
        if(val === 'simples') {
            if(containerSplitBox) containerSplitBox.style.display = 'none';
            if(splitParticipantesBox) splitParticipantesBox.style.display = 'none';
        } else {
            if(containerSplitBox) containerSplitBox.style.display = 'flex';
            if(splitParticipantesBox) splitParticipantesBox.style.display = 'block';
        }

        renderizarDespesas(despesasData);
    };
    
    window.adicionarMembroViagem = async () => {
         const sel = document.getElementById('trip-amigos-disponiveis'); if(sel.value==="") return;
         const idA = sel.value, nmA = sel.options[sel.selectedIndex].getAttribute('data-nome');
         await updateDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId), { membros_uids:[...currentTripDoc.membros_uids, idA], membros_info:[...currentTripDoc.membros_info, {uid:idA, nome:nmA}] }); 
         await criarNotificacaoDB(idA, `${userName} adicionou-te à viagem "${currentTripDoc.nome}".`);
         window.mostrarAlerta(nmA+" inserido na viagem!");
    };

    window.removerMembroViagem = async (membroUid) => {
        if(confirm("Remover esta pessoa da viagem?")) {
            const novosUids = currentTripDoc.membros_uids.filter(u => u !== membroUid);
            const novaInfo = currentTripDoc.membros_info.filter(m => m.uid !== membroUid);
            await updateDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId), { membros_uids: novosUids, membros_info: novaInfo });
            if(membroUid === userId) {
                window.navegarMenu('menu-viagens');
            }
        }
    };

    function atualizarResumoInternoViagem(despesasPassadas) {
        if(!currentTripDoc) return;

        let duracaoTxt = "Não definida";
        if(currentTripDoc.dataInicio && currentTripDoc.dataFim) {
            let d1 = new Date(currentTripDoc.dataInicio);
            let d2 = new Date(currentTripDoc.dataFim);
            let diffTime = Math.abs(d2 - d1);
            let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            duracaoTxt = diffDays + (diffDays === 1 ? " dia" : " dias");
        }
        if(document.getElementById('summary-duracao-dias')) document.getElementById('summary-duracao-dias').innerText = duracaoTxt;
        if(document.getElementById('summary-total-locais')) document.getElementById('summary-total-locais').innerText = timelineEventsData.length + (timelineEventsData.length === 1 ? " sítio" : " sítios");

        if(despesasPassadas) {
            let totalGasto = 0;
            let pagosPorPessoa = {};
            currentTripDoc.membros_info.forEach(m => pagosPorPessoa[m.uid] = { nome: m.nome, total: 0 });

            despesasPassadas.forEach(d => {
                totalGasto += d.valor;
                if(pagosPorPessoa[d.pagadorUid]) pagosPorPessoa[d.pagadorUid].total += d.valor;
            });

            if(document.getElementById('summary-total-gasto')) document.getElementById('summary-total-gasto').innerText = totalGasto.toFixed(2) + '€';

            let htmlMembros = '';
            Object.keys(pagosPorPessoa).forEach(u => {
                htmlMembros += `<div class="summary-row">
                    <span class="summary-label">Pago por ${pagosPorPessoa[u].nome}:</span>
                    <span class="summary-val">${pagosPorPessoa[u].total.toFixed(2)}€</span>
                </div>`;
            });
            if(document.getElementById('summary-pagamento-membros')) document.getElementById('summary-pagamento-membros').innerHTML = htmlMembros;
        }
    }

    function renderizarGraficosResumo(listaDespesas) {
        const dpr = window.devicePixelRatio || 1;

        const canvasL = document.getElementById('chart-linha-gastos');
        if(canvasL && canvasL.parentElement) {
            const ctxL = canvasL.getContext('2d');
            const rectL = canvasL.parentElement.getBoundingClientRect();
            
            canvasL.width = (rectL.width - 30) * dpr;
            canvasL.height = 150 * dpr;
            ctxL.scale(dpr, dpr);
            
            ctxL.clearRect(0,0,rectL.width - 30,150);

            let gastosPorDia = {};
            listaDespesas.forEach(d => {
                let dia = d.dataStr || 'Hoje';
                gastosPorDia[dia] = (gastosPorDia[dia] || 0) + d.valor;
            });

            let diasKeys = Object.keys(gastosPorDia);
            if(diasKeys.length === 0) diasKeys = ['Sem dados'];

            let maxGasto = Math.max(...Object.values(gastosPorDia), 10);
            let paddingLeft = 35, paddingBottom = 25, widthChart = (rectL.width - 30) - paddingLeft - 10, heightChart = 150 - paddingBottom - 10;

            ctxL.strokeStyle = 'rgba(255,255,255,0.1)';
            ctxL.lineWidth = 1;
            ctxL.beginPath();
            ctxL.moveTo(paddingLeft, 10);
            ctxL.lineTo(paddingLeft, heightChart + 10);
            ctxL.lineTo(paddingLeft + widthChart, heightChart + 10);
            ctxL.stroke();

            ctxL.fillStyle = 'rgba(255,255,255,0.5)';
            ctxL.font = '10px Poppins';
            ctxL.fillText(Math.round(maxGasto) + '€', 2, 15);
            ctxL.fillText('0€', 12, heightChart + 10);

            let stepX = widthChart / Math.max(diasKeys.length - 1, 1);
            ctxL.strokeStyle = '#FF6B00';
            ctxL.lineWidth = 2.5;
            ctxL.beginPath();

            diasKeys.forEach((dia, idx) => {
                let val = gastosPorDia[dia] || 0;
                let x = paddingLeft + (idx * stepX);
                let y = (heightChart + 10) - ((val / maxGasto) * heightChart);

                if(idx === 0) ctxL.moveTo(x, y);
                else ctxL.lineTo(x, y);

                ctxL.fillStyle = 'rgba(255,255,255,0.5)';
                ctxL.fillText(dia.substring(0,5), x - 10, heightChart + 22);
            });
            ctxL.stroke();
        }

        const canvasP = document.getElementById('chart-pie-categorias');
        if(canvasP && canvasP.parentElement) {
            const ctxP = canvasP.getContext('2d');
            const rectP = canvasP.parentElement.getBoundingClientRect();

            canvasP.width = (rectP.width - 30) * dpr;
            canvasP.height = 150 * dpr;
            ctxP.scale(dpr, dpr);

            ctxP.clearRect(0,0,rectP.width - 30,150);

            let porCat = {};
            listaDespesas.forEach(d => {
                let c = d.categoria || 'Geral';
                porCat[c] = (porCat[c] || 0) + d.valor;
            });

            let total = Object.values(porCat).reduce((a,b)=>a+b, 0);
            if(total === 0) { porCat = {'Sem dados': 1}; total = 1; }

            const cores = ['#FF6B00', '#007AFF', '#28CD41', '#AF52DE', '#FF3B30', '#FFCC00'];
            let startAngle = 0;
            let centerX = (rectP.width - 30) / 3, centerY = 75, radius = 50;

            Object.keys(porCat).forEach((cat, idx) => {
                let val = porCat[cat];
                let sliceAngle = (val / total) * 2 * Math.PI;

                ctxP.fillStyle = cores[idx % cores.length];
                ctxP.beginPath();
                ctxP.moveTo(centerX, centerY);
                ctxP.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                ctxP.closePath();
                ctxP.fill();

                let legendY = 25 + (idx * 20);
                ctxP.fillRect((rectP.width - 30) / 2 + 10, legendY - 8, 10, 10);
                ctxP.fillStyle = 'rgba(255,255,255,0.8)';
                ctxP.font = '11px Poppins';
                ctxP.fillText(`${cat}: ${val.toFixed(2)}€`, (rectP.width - 30) / 2 + 26, legendY);

                startAngle += sliceAngle;
            });
        }
    }

    /* PLANEAMENTO */
    window.processarFotoEvento = (ev) => {
        const file = ev.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image(); img.onload = () => {
                const canvas = document.createElement('canvas'); const max = 800; let w=img.width, h=img.height;
                if(w>h){if(w>max){h*=max/w; w=max;}}else{if(h>max){w*=max/h; h=max;}} canvas.width=w; canvas.height=h;
                canvas.getContext('2d').drawImage(img,0,0,w,h);
                tempEventFoto = canvas.toDataURL('image/jpeg',0.6);
                document.getElementById('preview-event-foto').src = tempEventFoto;
                document.getElementById('preview-event-foto').style.display = 'block';
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    };

    function renderizarTimelineEvents() {
        const container = document.getElementById('container-timeline-events');
        if(!container) return;
        if(timelineEventsData.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding-top:20px;">Ainda não adicionaste atividades no planeamento. Clica no botão acima!</p>';
            return;
        }

        timelineEventsData.sort((a,b) => {
            let keyA = (a.data || '') + ' ' + (a.hora || '');
            let keyB = (b.data || '') + ' ' + (b.hora || '');
            return keyA.localeCompare(keyB);
        });

        let html = '';
        timelineEventsData.forEach(ev => {
            html += `<div class="timeline-item">
                <div class="timeline-header">
                    <span class="timeline-time">${ev.data || ''} ${ev.hora ? '• ' + ev.hora : ''}</span>
                    <div style="display:flex;gap:5px;">
                        <button class="btn-icon-list" onclick="prepararEditarEvento('${ev.id}')">${iconEdit}</button>
                        <button class="btn-icon-list" onclick="apagarEventoTimeline('${ev.id}')">${iconTrash}</button>
                    </div>
                </div>
                <div class="timeline-title">${ev.titulo}</div>
                ${ev.notas ? `<div class="timeline-notes">${ev.notas}</div>` : ''}
                ${ev.foto ? `<img src="${ev.foto}" class="timeline-img">` : ''}
            </div>`;
        });
        container.innerHTML = html;
    }

    window.guardarEventoTimeline = async () => {
        const evId = document.getElementById('edit-event-id').value;
        const dt = document.getElementById('input-event-data').value;
        const hr = document.getElementById('input-event-hora').value;
        const tit = document.getElementById('input-event-titulo').value.trim();
        const nts = document.getElementById('input-event-notas').value.trim();

        if(!tit) return window.mostrarAlerta("Insere um título ou localização.");

        const payload = { data: dt, hora: hr, titulo: tit, notas: nts, foto: tempEventFoto || "", timestamp: Date.now() };

        if(evId) {
            await updateDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId,'timeline',evId), payload);
        } else {
            await addDoc(collection(db,'artifacts',appId,'viagens_partilhadas',currentTripId,'timeline'), payload);
        }

        fecharModal('modal-novo-evento');
        document.getElementById('edit-event-id').value = '';
        document.getElementById('input-event-titulo').value = '';
        document.getElementById('input-event-notas').value = '';
        document.getElementById('preview-event-foto').style.display = 'none';
        tempEventFoto = "";
    };

    window.prepararEditarEvento = (id) => {
        const ev = timelineEventsData.find(x => x.id === id);
        if(!ev) return;
        document.getElementById('edit-event-id').value = ev.id;
        document.getElementById('input-event-data').value = ev.data || '';
        document.getElementById('input-event-hora').value = ev.hora || '';
        document.getElementById('input-event-titulo').value = ev.titulo || '';
        document.getElementById('input-event-notas').value = ev.notas || '';
        if(ev.foto) {
            tempEventFoto = ev.foto;
            document.getElementById('preview-event-foto').src = ev.foto;
            document.getElementById('preview-event-foto').style.display = 'block';
        }
        document.getElementById('modal-evento-titulo-header').innerText = "Editar Passo";
        abrirModal('modal-novo-evento');
    };

    window.apagarEventoTimeline = async (id) => {
        if(confirm("Apagar esta atividade?")) {
            await deleteDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId,'timeline',id));
        }
    };

    /* DESPESAS */
    window.adicionarDespesa = async () => {
        const desc = document.getElementById('exp-desc').value.trim();
        const val = parseFloat(document.getElementById('exp-valor').value);
        
        let uidP = userId;
        let modo = 'iguais';
        let divididos = currentTripDoc ? currentTripDoc.membros_uids : [userId];
        let quotasExatas = {};

        if(modoDespesasAtivo === 'splitwise' && currentTripDoc) {
            uidP = document.getElementById('exp-pagador').value; 
            modo = document.getElementById('exp-modo-divisao').value;
            divididos = [];

            if(modo === 'iguais') {
                document.querySelectorAll('.chk-split-membro:checked').forEach(c => divididos.push(c.value));
            } else {
                document.querySelectorAll('.val-split-exato').forEach(inp => {
                    let v = parseFloat(inp.value) || 0;
                    if(v > 0) {
                        let u = inp.getAttribute('data-uid');
                        divididos.push(u);
                        quotasExatas[u] = v;
                    }
                });
            }
        }

        if(!desc || !val || val<=0) return window.mostrarAlerta("Preenche a descrição e um valor válido.");

        const pObj = currentTripDoc ? currentTripDoc.membros_info.find(i => i.uid === uidP) : null;
        const cat = obterCategoriaPorTexto(desc);
        
        const agora = new Date();
        const dataAddStr = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}`;

        await addDoc(collection(db,'artifacts',appId,'viagens_partilhadas',currentTripId,'despesas'), {
            desc: desc, 
            valor: val, 
            pagadorUid: uidP, 
            pagadorNome: (pObj?pObj.nome:userName), 
            divididoPor: divididos,
            modoDivisao: modo,
            quotasExatas: quotasExatas,
            categoria: cat.nome,
            dataStr: dataAddStr,
            timestamp: Date.now()
        }); 

        fecharModal('modal-nova-despesa');
        document.getElementById('exp-desc').value=''; 
        document.getElementById('exp-valor').value='';
    };
    
    function renderizarDespesas(listaExp) {
        let saldos = {}, htmlD = '';
        if(currentTripDoc && currentTripDoc.membros_info) {
            currentTripDoc.membros_info.forEach(m => saldos[m.uid] = { nome: m.nome, pago: 0, deve: 0 });
        }

        listaExp.sort((a,b) => b.timestamp - a.timestamp);

        let saldoIndividualTxt = "";
        
        listaExp.forEach(e => { 
            if(saldos[e.pagadorUid]) saldos[e.pagadorUid].pago += e.valor;

            let participantes = e.divididoPor || (currentTripDoc ? currentTripDoc.membros_uids : []);

            if(e.modoDivisao === 'exatos' && e.quotasExatas) {
                Object.keys(e.quotasExatas).forEach(pUid => {
                    if(saldos[pUid]) saldos[pUid].deve += e.quotasExatas[pUid];
                });
            } else {
                let quota = e.valor / Math.max(participantes.length, 1);
                participantes.forEach(pUid => {
                    if(saldos[pUid]) saldos[pUid].deve += quota;
                });
            }
        });

        const meuSaldo = (saldos[userId] ? (saldos[userId].pago - saldos[userId].deve) : 0);

        Object.keys(saldos).forEach(u => {
            if(u !== userId) {
                let saldoPessoa = saldos[u].pago - saldos[u].deve;
                let relacao = 0;
                if(meuSaldo > 0 && saldoPessoa < 0) {
                    relacao = Math.min(meuSaldo, Math.abs(saldoPessoa));
                } else if(meuSaldo < 0 && saldoPessoa > 0) {
                    relacao = -Math.min(Math.abs(meuSaldo), saldoPessoa);
                }

                if(relacao > 0.01) {
                    saldoIndividualTxt += `<div style="color:var(--green-split);font-weight:700;">${saldos[u].nome} deve-lhe ${relacao.toFixed(2)} €</div>`;
                } else if(relacao < -0.01) {
                    saldoIndividualTxt += `<div style="color:var(--red-split);font-weight:700;">Deve a ${saldos[u].nome} ${Math.abs(relacao).toFixed(2)} €</div>`;
                }
            }
        });

        const debtHeader = document.getElementById('split-individual-debt-header');
        if(debtHeader) {
            if(modoDespesasAtivo === 'splitwise') {
                debtHeader.innerHTML = saldoIndividualTxt || '<span style="color:var(--text-muted)">Sem dívidas ativas</span>';
                debtHeader.style.display = 'block';
            } else {
                debtHeader.style.display = 'none';
            }
        }

        let lastDateHeader = "";

        listaExp.forEach(e => {
            const catInfo = obterCategoriaPorTexto(e.desc);
            let participantes = e.divididoPor || (currentTripDoc ? currentTripDoc.membros_uids : []);
            let quota = e.valor / Math.max(participantes.length, 1);

            let dateHeader = e.dataStr || "hoje";
            if(dateHeader !== lastDateHeader) {
                htmlD += `<div class="date-header-group">${dateHeader}</div>`;
                lastDateHeader = dateHeader;
            }

            if(modoDespesasAtivo === 'simples') {
                htmlD += `<div class="expense-item-split">
                    <div class="expense-left">
                        <div class="expense-icon-box">${catInfo.icon}</div>
                        <div class="expense-details">
                            <span class="expense-title-txt">${e.desc}</span>
                        </div>
                    </div>
                    <div class="expense-right">
                        <span class="expense-split-val" style="color:var(--text-main);">${e.valor.toFixed(2)} €</span>
                    </div>
                </div>`;
            } else {
                let isPagadorEu = (e.pagadorUid === userId);
                let estaNaDivisaoEu = participantes.includes(userId);

                let tagTexto = "", tagClasse = "", valTexto = "";

                if(isPagadorEu) {
                    let emprestado = e.valor - (estaNaDivisaoEu ? quota : 0);
                    tagTexto = "emprestou";
                    tagClasse = "emprestou";
                    valTexto = `${emprestado.toFixed(2)} €`;
                } else if(estaNaDivisaoEu) {
                    tagTexto = "emprestaram-lhe";
                    tagClasse = "emprestaram";
                    valTexto = `${quota.toFixed(2)} €`;
                } else {
                    tagTexto = "não envolvido";
                    tagClasse = "";
                    valTexto = "0.00 €";
                }

                htmlD += `<div class="expense-item-split">
                    <div class="expense-left">
                        <div class="expense-icon-box">${catInfo.icon}</div>
                        <div class="expense-details">
                            <span class="expense-title-txt">${e.desc}</span>
                            <span class="expense-subtitle-txt">${isPagadorEu ? 'Pagou' : e.pagadorNome + ' pagou'} ${e.valor.toFixed(2)} €</span>
                        </div>
                    </div>
                    <div class="expense-right">
                        <span class="expense-split-tag ${tagClasse}">${tagTexto}</span>
                        <span class="expense-split-val ${tagClasse}">${valTexto}</span>
                    </div>
                </div>`;
            }
        });

        if(document.getElementById('container-despesas')) {
            document.getElementById('container-despesas').innerHTML = htmlD || '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0;">Sem despesas registadas.</p>';
        }
    }

    /* LIQUIDAÇÃO DIRECIONADA DE CONTAS */
    window.abrirModalLiquidação = () => {
        let options = '';
        if(currentTripDoc && currentTripDoc.membros_info) {
            currentTripDoc.membros_info.forEach(m => {
                if(m.uid !== userId) {
                    options += `<option value="${m.uid}">${m.nome}</option>`;
                }
            });
        }
        if(!options) return window.mostrarAlerta("Não há outros membros para liquidar.");
        document.getElementById('select-liquidar-pessoa').innerHTML = options;
        abrirModal('modal-liquidacao');
    };

    window.confirmarLiquidaçãoPessoa = async () => {
        const targetUid = document.getElementById('select-liquidar-pessoa').value;
        const targetObj = currentTripDoc ? currentTripDoc.membros_info.find(m => m.uid === targetUid) : null;
        
        await addDoc(collection(db,'artifacts',appId,'viagens_partilhadas',currentTripId,'despesas'), {
            desc: `Liquidação com ${targetObj ? targetObj.nome : ''}`,
            valor: 0,
            pagadorUid: userId,
            pagadorNome: userName,
            divididoPor: [userId, targetUid],
            timestamp: Date.now()
        });
        
        fecharModal('modal-liquidacao');
        window.mostrarAlerta(`Contas liquidadas com ${targetObj ? targetObj.nome : ''}.`);
    };
    
    window.apagarDespesa = async (id) => { if(currentTripId) await deleteDoc(doc(db,'artifacts',appId,'viagens_partilhadas',currentTripId,'despesas',id)); };
    window.abrirModal = (id) => document.getElementById(id).classList.add('active'); 
    window.fecharModal = (id) => document.getElementById(id).classList.remove('active'); 
    window.mostrarAlerta = (msg) => { document.getElementById('mensagem-alerta').innerText=msg; window.abrirModal('modal-alerta'); };
