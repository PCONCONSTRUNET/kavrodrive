import {
  RideCategoryConfig,
  CategoryEligibilityEvaluation,
  DriverProfile,
  ServiceCategoryType,
  SystemConfig
} from '../types';

export const DEFAULT_RIDE_CATEGORIES: RideCategoryConfig[] = [
  {
    id: 'kavro_go',
    code: 'PADRAO',
    name: 'Padrão',
    subtitle: 'Viagem de passageiros',
    description: 'Transporte padrão de passageiros em veículos 4 portas com ar-condicionado e documentação regular.',
    categoryType: 'padrao',
    active: true,
    sortOrder: 1,
    multiplier: 1.0,
    baseFare: 8.0,
    pricePerKm: 3.2,
    pricePerMinute: 0.5,
    minimumFare: 15.0,
    commissionPercent: 20,
    maxPassengers: 4,
    minVehicleYear: 2015,
    minDriverRating: 4.5,
    minCompletedRides: 0,
    requireFourDoors: true,
    requireAirConditioning: true,
    requireRegularDoc: true,
    requireEar: true,
    requireLargeTrunk: false,
    requireLeatherSeats: false,
    allowedModels: [],
    allowedCities: [],
    cityOverrides: []
  },
  {
    id: 'kavro_entregas',
    code: 'ENTREGAS',
    name: 'Entregas',
    subtitle: 'Produtos e encomendas',
    description: 'Envie ou receba produtos, pacotes, compras e documentos direto até o endereço informado.',
    categoryType: 'entregas',
    active: true,
    sortOrder: 2,
    multiplier: 0.95,
    baseFare: 7.5,
    pricePerKm: 3.0,
    pricePerMinute: 0.45,
    minimumFare: 14.0,
    commissionPercent: 20,
    maxPassengers: 0,
    minVehicleYear: 2012,
    minDriverRating: 4.5,
    minCompletedRides: 0,
    requireFourDoors: false,
    requireAirConditioning: false,
    requireRegularDoc: true,
    requireEar: true,
    requireLargeTrunk: false,
    requireLeatherSeats: false,
    allowedModels: [],
    allowedCities: [],
    cityOverrides: []
  }
];

const DEPRECATED_LEGACY_TIER_IDS = new Set([
  'kavro_plus', 'kavro_exec', 'comfort', 'plus', 'aeroporto', 'exec', 'executivo', 'bagagem'
]);

export function mapLegacyCategoryId(categoryId?: string | null): string {
  const raw = String(categoryId || '').trim().toLowerCase();
  if (
    !raw ||
    raw === 'standard' ||
    raw === 'upx' ||
    raw === 'go' ||
    raw === 'padrao' ||
    raw === 'padrão' ||
    raw === 'comfort' ||
    raw === 'plus' ||
    raw === 'kavro_plus' ||
    raw === 'aeroporto' ||
    raw === 'exec' ||
    raw === 'executivo' ||
    raw === 'bagagem' ||
    raw === 'kavro_exec'
  ) {
    return 'kavro_go';
  }
  if (
    raw === 'entregas' ||
    raw === 'entrega' ||
    raw === 'envios' ||
    raw === 'envio' ||
    raw === 'flash' ||
    raw === 'delivery' ||
    raw === 'kavro_flash' ||
    raw === 'kavro_entregas'
  ) {
    return 'kavro_entregas';
  }
  return raw;
}

export function resolveCategoryType(categoryOrId?: Partial<RideCategoryConfig> | string | null): ServiceCategoryType {
  if (typeof categoryOrId === 'string') {
    const mapped = mapLegacyCategoryId(categoryOrId);
    if (
      mapped === 'kavro_entregas' ||
      /entrega|envio|flash|delivery|pacote|encomenda/.test(String(categoryOrId).toLowerCase())
    ) {
      return 'entregas';
    }
    return 'padrao';
  }
  if (!categoryOrId || typeof categoryOrId !== 'object') return 'padrao';
  if (categoryOrId.categoryType === 'entregas' || categoryOrId.categoryType === 'padrao') {
    return categoryOrId.categoryType;
  }
  const text = `${categoryOrId.id || ''} ${categoryOrId.code || ''} ${categoryOrId.name || ''}`.toLowerCase();
  if (
    mapLegacyCategoryId(categoryOrId.id) === 'kavro_entregas' ||
    /entrega|envio|flash|delivery|pacote|encomenda/.test(text)
  ) {
    return 'entregas';
  }
  return 'padrao';
}

export function isDeliveryCategory(
  categoryOrId?: Partial<RideCategoryConfig> | string | null,
  config?: Partial<SystemConfig> | null
): boolean {
  if (typeof categoryOrId === 'string') {
    if (config) {
      const cat = getCategoryById(categoryOrId, config);
      if (cat && (cat.id === categoryOrId || mapLegacyCategoryId(cat.id) === mapLegacyCategoryId(categoryOrId))) {
        return resolveCategoryType(cat) === 'entregas';
      }
    }
    return resolveCategoryType(categoryOrId) === 'entregas';
  }
  return resolveCategoryType(categoryOrId) === 'entregas';
}

export function normalizeCategoriesFromConfig(config?: Partial<SystemConfig> | null): RideCategoryConfig[] {
  const rawList = Array.isArray(config?.rideCategories) && config!.rideCategories!.length > 0
    ? config!.rideCategories!
    : Array.isArray(config?.serviceCategories) && config!.serviceCategories!.length > 0
      ? config!.serviceCategories!
      : [];

  // Mantém estritamente as 2 opções oficiais da plataforma: Padrão e Entregas
  const hasKavroIds = rawList.some(c =>
    c.id === 'kavro_go' || c.id === 'kavro_plus' || c.id === 'kavro_exec' || c.id === 'kavro_entregas' ||
    String(c.name || '').toUpperCase().includes('KAVRO GO') ||
    String(c.name || '').toUpperCase() === 'PADRÃO'
  );

  if (rawList.length === 0 || !hasKavroIds) {
    const baseFareCfg = Number(config?.baseFare ?? 8.0);
    const kmCfg = Number(config?.pricePerKm ?? 3.2);
    const minCfg = Number(config?.pricePerMinute ?? 0.5);
    const floorCfg = Number(config?.minimumFare ?? 15.0);
    const commCfg = Number(config?.platformCommissionPercent ?? 20);

    return DEFAULT_RIDE_CATEGORIES.map(def => {
      if (def.id === 'kavro_entregas') {
        return { ...def, commissionPercent: commCfg };
      }
      return {
        ...def,
        baseFare: Math.round(baseFareCfg * 100) / 100,
        pricePerKm: Math.round(kmCfg * 100) / 100,
        pricePerMinute: Math.round(minCfg * 100) / 100,
        minimumFare: Math.round(floorCfg * 100) / 100,
        commissionPercent: commCfg
      };
    });
  }

  const filteredList = rawList.filter((item: any) => !DEPRECATED_LEGACY_TIER_IDS.has(String(item?.id || '').trim().toLowerCase()));
  const seenIds = new Set<string>();
  const mappedList: RideCategoryConfig[] = [];

  for (let idx = 0; idx < filteredList.length; idx++) {
    const item: any = filteredList[idx];
    const mappedId = mapLegacyCategoryId(item.id);
    if (seenIds.has(mappedId)) continue;
    seenIds.add(mappedId);

    const def = DEFAULT_RIDE_CATEGORIES.find(d => d.id === mappedId) || DEFAULT_RIDE_CATEGORIES[0];
    const mult = Number(item.multiplier ?? def.multiplier ?? 1.0);
    const baseFareCfg = Number(config?.baseFare ?? 8.0);
    const kmCfg = Number(config?.pricePerKm ?? 3.2);
    const minCfg = Number(config?.pricePerMinute ?? 0.5);
    const floorCfg = Number(config?.minimumFare ?? 15.0);

    const rawName = String(item.name || '').trim();
    const isLegacyDefaultName =
      (mappedId === 'kavro_go' && (!rawName || rawName.toUpperCase() === 'KAVRO GO')) ||
      (mappedId === 'kavro_entregas' && (!rawName || rawName.toUpperCase() === 'KAVRO ENTREGAS'));

    mappedList.push({
      id: mappedId === 'kavro_go' || mappedId === 'kavro_entregas' ? mappedId : (item.id || def.id),
      code: isLegacyDefaultName ? def.code : (item.code || def.code || String(item.name || 'CAT').slice(0, 4).toUpperCase()),
      name: isLegacyDefaultName ? def.name : rawName,
      subtitle: isLegacyDefaultName ? def.subtitle : (item.subtitle ?? def.subtitle ?? ''),
      description: item.description || def.description,
      categoryType: item.categoryType === 'entregas' || item.categoryType === 'padrao'
        ? item.categoryType
        : resolveCategoryType(item),
      active: item.active !== false,
      sortOrder: Number(item.sortOrder ?? idx + 1),
      multiplier: mult,
      baseFare: Number(item.baseFare ?? Math.round(baseFareCfg * mult * 100) / 100),
      pricePerKm: Number(item.pricePerKm ?? Math.round(kmCfg * mult * 100) / 100),
      pricePerMinute: Number(item.pricePerMinute ?? Math.round(minCfg * mult * 100) / 100),
      minimumFare: Number(item.minimumFare ?? Math.round(floorCfg * mult * 100) / 100),
      commissionPercent: Number(item.commissionPercent ?? config?.platformCommissionPercent ?? def.commissionPercent ?? 20),
      maxPassengers: Number(item.maxPassengers ?? def.maxPassengers ?? 4),
      minVehicleYear: Number(item.minVehicleYear ?? def.minVehicleYear ?? 2015),
      minDriverRating: Number(item.minDriverRating ?? def.minDriverRating ?? 4.5),
      minCompletedRides: Number(item.minCompletedRides ?? def.minCompletedRides ?? 0),
      requireFourDoors: item.requireFourDoors !== undefined ? Boolean(item.requireFourDoors) : def.requireFourDoors,
      requireAirConditioning: item.requireAirConditioning !== undefined ? Boolean(item.requireAirConditioning) : def.requireAirConditioning,
      requireRegularDoc: item.requireRegularDoc !== undefined ? Boolean(item.requireRegularDoc) : def.requireRegularDoc,
      requireEar: item.requireEar !== undefined ? Boolean(item.requireEar) : def.requireEar,
      requireLargeTrunk: item.requireLargeTrunk !== undefined ? Boolean(item.requireLargeTrunk) : def.requireLargeTrunk,
      requireLeatherSeats: item.requireLeatherSeats !== undefined ? Boolean(item.requireLeatherSeats) : def.requireLeatherSeats,
      allowedModels: Array.isArray(item.allowedModels) ? item.allowedModels : def.allowedModels,
      allowedCities: Array.isArray(item.allowedCities) ? item.allowedCities : def.allowedCities,
      cityOverrides: Array.isArray(item.cityOverrides) ? item.cityOverrides : []
    });
  }

  if (!mappedList.some(c => c.id === 'kavro_go' || resolveCategoryType(c) === 'padrao')) {
    const padraoDef = DEFAULT_RIDE_CATEGORIES[0];
    mappedList.unshift({
      ...padraoDef,
      commissionPercent: Number(config?.platformCommissionPercent ?? padraoDef.commissionPercent ?? 20)
    });
  }

  if (!mappedList.some(c => c.id === 'kavro_entregas' || resolveCategoryType(c) === 'entregas')) {
    const entregasDef = DEFAULT_RIDE_CATEGORIES.find(d => d.id === 'kavro_entregas');
    if (entregasDef) {
      mappedList.push({
        ...entregasDef,
        sortOrder: mappedList.length + 1,
        commissionPercent: Number(config?.platformCommissionPercent ?? entregasDef.commissionPercent ?? 20)
      });
    }
  }

  return mappedList;
}

export function getCategoryById(
  categoryId: string | undefined,
  config?: Partial<SystemConfig> | null
): RideCategoryConfig {
  const categories = normalizeCategoriesFromConfig(config);
  const mappedId = mapLegacyCategoryId(categoryId);
  return (
    categories.find(c => c.id === categoryId || c.id === mappedId) ||
    categories.find(c => c.active) ||
    categories[0] ||
    DEFAULT_RIDE_CATEGORIES[0]
  );
}

export function getEffectiveCategoryPricing(
  category: RideCategoryConfig,
  city?: string
): {
  baseFare: number;
  pricePerKm: number;
  pricePerMinute: number;
  minimumFare: number;
  commissionPercent: number;
  multiplier: number;
} {
  const cleanCity = String(city || '').trim().toLowerCase();
  const cityOverride = cleanCity && Array.isArray(category.cityOverrides)
    ? category.cityOverrides.find(
        o => o.active !== false && String(o.city || '').trim().toLowerCase() === cleanCity
      )
    : undefined;

  return {
    baseFare: Number(cityOverride?.baseFare ?? category.baseFare ?? 8.0),
    pricePerKm: Number(cityOverride?.pricePerKm ?? category.pricePerKm ?? 3.2),
    pricePerMinute: Number(cityOverride?.pricePerMinute ?? category.pricePerMinute ?? 0.5),
    minimumFare: Number(cityOverride?.minimumFare ?? category.minimumFare ?? 15.0),
    commissionPercent: Number(cityOverride?.commissionPercent ?? category.commissionPercent ?? 20),
    multiplier: Number(cityOverride?.multiplier ?? category.multiplier ?? 1.0)
  };
}

export function matchesAllowedModel(
  vehicleBrand?: string,
  vehicleModel?: string,
  vehicleVersion?: string,
  allowedModels?: string[]
): boolean {
  if (!Array.isArray(allowedModels) || allowedModels.length === 0) {
    return true;
  }
  const fullVehicleText = `${vehicleBrand || ''} ${vehicleModel || ''} ${vehicleVersion || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (!fullVehicleText) return false;

  return allowedModels.some(allowed => {
    const cleanAllowed = String(allowed || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    return cleanAllowed.length > 0 && fullVehicleText.includes(cleanAllowed);
  });
}

export function evaluateDriverCategoryEligibility(
  driver: Partial<DriverProfile>,
  category: RideCategoryConfig,
  options?: { ignoreApprovalStatus?: boolean }
): CategoryEligibilityEvaluation {
  const reasons: string[] = [];
  const metCriteria: string[] = [];

  const approvedExceptions = Array.isArray(driver.approvedCategoryExceptions)
    ? driver.approvedCategoryExceptions
    : [];
  const blockedIds = Array.isArray(driver.blockedCategoryIds)
    ? driver.blockedCategoryIds
    : [];
  const pendingRequests = Array.isArray(driver.pendingCategoryRequests)
    ? driver.pendingCategoryRequests
    : [];

  const isManuallyApprovedException = approvedExceptions.includes(category.id);
  const isManuallyBlocked = blockedIds.includes(category.id);
  const hasPendingExceptionRequest = pendingRequests.includes(category.id);

  if (!category.active) {
    reasons.push('Categoria temporariamente desativada pela administração.');
  }

  if (isManuallyBlocked) {
    reasons.push('Categoria bloqueada manualmente pela administração para este perfil.');
  }

  // 1. Ano do veículo
  const vehicleYearNum = parseInt(String(driver.vehicleYear || '0').replace(/\D/g, ''), 10) || 0;
  const minYear = Number(category.minVehicleYear || 2014);
  if (vehicleYearNum >= minYear) {
    metCriteria.push(`Ano do veículo (${vehicleYearNum}) atende ao mínimo (${minYear})`);
  } else {
    reasons.push(`Ano do veículo (${vehicleYearNum || 'N/I'}) inferior ao mínimo exigido (${minYear})`);
  }

  // 2. Modelos permitidos
  if (Array.isArray(category.allowedModels) && category.allowedModels.length > 0) {
    const modelOk = matchesAllowedModel(
      driver.vehicleBrand,
      driver.vehicleModel,
      driver.vehicleVersion,
      category.allowedModels
    );
    if (modelOk) {
      metCriteria.push(`Modelo ${driver.vehicleBrand || ''} ${driver.vehicleModel || ''} homologado na categoria`);
    } else {
      reasons.push(`Modelo (${driver.vehicleBrand || ''} ${driver.vehicleModel || ''}) não consta na lista da categoria ${category.name}`);
    }
  } else {
    metCriteria.push('Qualquer modelo homologado com os requisitos básicos');
  }

  // 3. Quatro portas
  const hasFourDoors = driver.hasFourDoors !== false;
  if (category.requireFourDoors) {
    if (hasFourDoors) {
      metCriteria.push('Veículo com 4 portas');
    } else {
      reasons.push('Exige veículo com 4 portas');
    }
  }

  // 4. Ar-condicionado
  const hasAc = driver.hasAirConditioning !== false;
  if (category.requireAirConditioning) {
    if (hasAc) {
      metCriteria.push('Ar-condicionado ativo');
    } else {
      reasons.push('Exige ar-condicionado em funcionamento');
    }
  }

  // 5. Documentação CRLV regular
  const crlvRegular = driver.crlvRegular !== false;
  if (category.requireRegularDoc) {
    if (crlvRegular) {
      metCriteria.push('Documentação e CRLV regulares');
    } else {
      reasons.push('CRLV pendente de regularização');
    }
  }

  // 6. CNH com EAR
  const hasEar = driver.cnhHasEar !== false;
  if (category.requireEar) {
    if (hasEar) {
      metCriteria.push('CNH com observação EAR');
    } else {
      reasons.push('Exige CNH com EAR (Exerce Atividade Remunerada)');
    }
  }

  // 7. Porta-malas amplo / espaço interno (PLUS / EXEC)
  if (category.requireLargeTrunk) {
    // Se o modelo já está na lista de permitidos da categoria ou o motorista marcou porta-malas amplo
    const modelInPlusOrExec = matchesAllowedModel(
      driver.vehicleBrand,
      driver.vehicleModel,
      driver.vehicleVersion,
      category.allowedModels
    );
    const hasLargeTrunk = driver.hasLargeTrunk !== undefined ? Boolean(driver.hasLargeTrunk) : modelInPlusOrExec;
    if (hasLargeTrunk) {
      metCriteria.push('Espaço interno amplo e porta-malas confortável');
    } else {
      reasons.push('Exige veículo espaçoso (Sedan, SUV ou porta-malas amplo)');
    }
  }

  // 8. Bancos em couro / acabamento executivo (EXEC)
  if (category.requireLeatherSeats) {
    const modelInExec = matchesAllowedModel(
      driver.vehicleBrand,
      driver.vehicleModel,
      driver.vehicleVersion,
      category.allowedModels
    );
    const hasLeather = driver.hasLeatherSeats !== undefined ? Boolean(driver.hasLeatherSeats) : modelInExec;
    if (hasLeather) {
      metCriteria.push('Acabamento executivo / bancos em couro');
    } else {
      reasons.push('Exige acabamento executivo / bancos em couro');
    }
  }

  // 9. Avaliação média mínima
  const driverRating = Number(driver.rating ?? 5.0);
  if (category.minDriverRating > 0) {
    if (driverRating >= category.minDriverRating) {
      metCriteria.push(`Avaliação (${driverRating.toFixed(2)}) ≥ ${category.minDriverRating.toFixed(2)}`);
    } else {
      reasons.push(`Avaliação atual (${driverRating.toFixed(2)}) abaixo do mínimo (${category.minDriverRating.toFixed(2)})`);
    }
  }

  // 10. Quantidade mínima de viagens concluídas
  const totalRides = Number(driver.totalRides ?? 0);
  if (category.minCompletedRides > 0 && !options?.ignoreApprovalStatus) {
    if (totalRides >= category.minCompletedRides) {
      metCriteria.push(`Experiência comprovada (${totalRides} viagens concluídas)`);
    } else {
      reasons.push(`Requer no mínimo ${category.minCompletedRides} viagens concluídas (atual: ${totalRides})`);
    }
  }

  // 11. Disponibilidade por cidade
  if (Array.isArray(category.allowedCities) && category.allowedCities.length > 0 && driver.city) {
    const cleanDriverCity = driver.city.toLowerCase().trim();
    const cityOk = category.allowedCities.some(c => cleanDriverCity.includes(c.toLowerCase().trim()));
    if (!cityOk) {
      reasons.push(`Categoria indisponível para a cidade (${driver.city})`);
    }
  }

  // Exceção manual aprovada pelo administrador supera regras de veículo/experiência (desde que categoria esteja ativa e não bloqueada)
  const passesCriteria = category.active && !isManuallyBlocked && (reasons.length === 0 || isManuallyApprovedException);

  // Situação cadastral / administrativa
  const approvalStatus = driver.approvalStatus || 'pendente_aprovacao';
  let status: 'liberada' | 'bloqueada' | 'aguardando_analise' = 'bloqueada';

  if (isManuallyBlocked || !category.active) {
    status = 'bloqueada';
  } else if (!options?.ignoreApprovalStatus && approvalStatus === 'pendente_aprovacao') {
    status = passesCriteria || hasPendingExceptionRequest ? 'aguardando_analise' : 'bloqueada';
  } else if (!options?.ignoreApprovalStatus && approvalStatus !== 'aprovado') {
    status = 'bloqueada';
    reasons.unshift('Cadastro administrativo suspenso ou pendente de liberação.');
  } else if (passesCriteria) {
    status = 'liberada';
  } else if (hasPendingExceptionRequest) {
    status = 'aguardando_analise';
  } else {
    status = 'bloqueada';
  }

  const isEligible = options?.ignoreApprovalStatus ? passesCriteria : status === 'liberada';
  const enabledList = Array.isArray(driver.enabledCategories) ? driver.enabledCategories : null;
  const isEnabledByDriver = isEligible && (enabledList ? enabledList.includes(category.id) : true);

  return {
    categoryId: category.id,
    categoryName: category.name,
    status,
    isEligible,
    isEnabledByDriver,
    isManuallyApprovedException,
    isManuallyBlocked,
    hasPendingExceptionRequest,
    reasons: isManuallyApprovedException ? [] : reasons,
    metCriteria
  };
}

export function evaluateAllDriverCategories(
  driver: Partial<DriverProfile>,
  categories: RideCategoryConfig[],
  options?: { ignoreApprovalStatus?: boolean }
): {
  evaluations: CategoryEligibilityEvaluation[];
  eligibleCategoryIds: string[];
  enabledCategoryIds: string[];
} {
  const evaluations = categories.map(cat => evaluateDriverCategoryEligibility(driver, cat, options));
  const eligibleCategoryIds = evaluations.filter(e => e.isEligible).map(e => e.categoryId);

  const existingEnabled = Array.isArray(driver.enabledCategories) && driver.enabledCategories.length > 0
    ? driver.enabledCategories.map(mapLegacyCategoryId)
    : null;
  const disabledIds = Array.isArray(driver.disabledCategoryIds)
    ? driver.disabledCategoryIds.map(mapLegacyCategoryId)
    : null;

  let enabledCategoryIds: string[];
  if (disabledIds) {
    enabledCategoryIds = eligibleCategoryIds.filter(id => !disabledIds.includes(id));
  } else if (existingEnabled) {
    enabledCategoryIds = eligibleCategoryIds.filter(id =>
      existingEnabled.includes(id) ||
      (resolveCategoryType(id) === 'entregas' && existingEnabled.includes('kavro_go'))
    );
  } else {
    enabledCategoryIds = [...eligibleCategoryIds];
  }

  // Se o motorista tinha categorias antigas e ficou com 0 ativas mas tem elegíveis, habilita as elegíveis por padrão
  const finalEnabled = enabledCategoryIds.length > 0 ? enabledCategoryIds : [...eligibleCategoryIds];

  // Mantém evaluations[].isEnabledByDriver 100% sincronizado com finalEnabled
  const syncedEvaluations = evaluations.map(ev => ({
    ...ev,
    isEnabledByDriver: ev.isEligible && finalEnabled.includes(ev.categoryId)
  }));

  return {
    evaluations: syncedEvaluations,
    eligibleCategoryIds,
    enabledCategoryIds: finalEnabled
  };
}

export function isDriverAvailableForCategory(
  driver: Partial<DriverProfile>,
  categoryId: string,
  categories: RideCategoryConfig[]
): boolean {
  if (driver.approvalStatus && driver.approvalStatus !== 'aprovado') return false;
  if (!driver.isOnline) return false;

  const targetId = mapLegacyCategoryId(categoryId);
  const targetCategory = categories.find(c => mapLegacyCategoryId(c.id) === targetId);
  if (targetCategory && targetCategory.active === false) return false;

  const blockedIds = Array.isArray(driver.blockedCategoryIds)
    ? driver.blockedCategoryIds.map(mapLegacyCategoryId)
    : [];
  if (blockedIds.includes(targetId)) return false;

  const disabledIds = Array.isArray(driver.disabledCategoryIds)
    ? driver.disabledCategoryIds.map(mapLegacyCategoryId)
    : [];
  if (disabledIds.includes(targetId)) return false;

  const evalInput: Partial<DriverProfile> = driver.approvalStatus
    ? driver
    : { ...driver, approvalStatus: 'aprovado' };
  const { eligibleCategoryIds, enabledCategoryIds } = evaluateAllDriverCategories(evalInput, categories);

  if (eligibleCategoryIds.includes(targetId) && enabledCategoryIds.includes(targetId)) {
    return true;
  }

  const serverEligible = Array.isArray(driver.eligibleCategories)
    ? driver.eligibleCategories.map(mapLegacyCategoryId)
    : [];
  const serverEnabled =
    Array.isArray(driver.enabledCategories) && driver.enabledCategories.length > 0
      ? driver.enabledCategories.map(mapLegacyCategoryId)
      : serverEligible;

  return (
    serverEligible.includes(targetId) &&
    (serverEnabled.includes(targetId) ||
      (disabledIds.length === 0 &&
        resolveCategoryType(targetId) === 'entregas' &&
        serverEnabled.includes('kavro_go')))
  );
}

