const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTsModule(relPath, customRequire) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });

  const mod = { exports: {} };
  const dir = path.dirname(fullPath);
  const localRequire = (specifier) => {
    if (customRequire && customRequire(specifier)) {
      return customRequire(specifier);
    }
    if (specifier.startsWith('.')) {
      const targetTs = path.resolve(dir, `${specifier}.ts`);
      if (fs.existsSync(targetTs)) {
        return loadTsModule(path.relative(path.resolve(__dirname, '..'), targetTs), customRequire);
      }
      const targetIdx = path.resolve(dir, specifier, 'index.ts');
      if (fs.existsSync(targetIdx)) {
        return loadTsModule(path.relative(path.resolve(__dirname, '..'), targetIdx), customRequire);
      }
    }
    return require(specifier);
  };

  const fn = new vm.Script(
    `(function(exports, require, module, __filename, __dirname) {\n${transpiled.outputText}\n})`,
    { filename: fullPath }
  ).runInThisContext();

  fn(mod.exports, localRequire, mod, fullPath, dir);
  return mod.exports;
}

const reactMock = {
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
};

const geo = loadTsModule('src/utils/geo.ts');
const compassAndGps = loadTsModule('src/utils/compassAndGps.ts', (spec) =>
  spec === 'react' ? reactMock : null
);

test('calculateExactMeters retorna distancia geodésica exata sem fator 1.3x nem arredondamento 0.1km', () => {
  // 0.001 grau de latitude equivale a ~111.19 metros
  const meters = geo.calculateExactMeters(-28.3910, -49.3935, -28.3900, -49.3935);
  assert.ok(meters > 110 && meters < 112.5, `esperado ~111.2m, obtido ${meters}`);

  // Distancia curta de 30m nao deve zerar nem pular para 100m
  const shortMeters = geo.calculateExactMeters(-28.3910, -49.3935, -28.39073, -49.3935);
  assert.ok(shortMeters > 25 && shortMeters < 35, `esperado ~30m, obtido ${shortMeters}`);
});

test('smoothAngle e shortestAngleDelta cruzam 359° <-> 0° pelo caminho mais curto', () => {
  assert.equal(geo.shortestAngleDelta(355, 5), 10);
  assert.equal(geo.shortestAngleDelta(5, 355), -10);

  const smoothed = geo.smoothAngle(355, 5, 0.5);
  assert.ok(Math.abs(smoothed - 0) < 0.001 || Math.abs(smoothed - 360) < 0.001);

  const bearingNorth = geo.calculateBearingDegrees(-28.4, -49.4, -28.39, -49.4);
  assert.ok(bearingNorth < 1 || bearingNorth > 359);

  const bearingEast = geo.calculateBearingDegrees(-28.4, -49.4, -28.4, -49.39);
  assert.ok(Math.abs(bearingEast - 90) < 1);
});

test('snapPointToRoute usa direcao do veiculo para desambiguar cruzamentos e detecta saida de rota (>60m)', () => {
  // Cruzamento em T: segmento 0 vai para Norte (0°), segmento 1 vai para Leste (90°)
  const polyline = [
    [-28.3920, -49.3935],
    [-28.3910, -49.3935],
    [-28.3910, -49.3925],
  ];

  // Ponto proximo a esquina indo para Leste (~90°) deve preferir o segmento Leste
  const eastSnap = geo.snapPointToRoute(
    { lat: -28.39106, lng: -49.39344, heading: 92 },
    polyline,
    60,
    { preferredHeading: 92, maxHeadingDiffDeg: 60 }
  );
  assert.equal(eastSnap.snapped, true);
  assert.equal(eastSnap.segmentIndex, 1);
  assert.ok(Math.abs(eastSnap.heading - 90) <= 5);

  // Ponto a ~150m da rota nao faz snap quando limite e 60m (dispara rerouting)
  const offRoute = geo.snapPointToRoute(
    { lat: -28.3910, lng: -49.3910, heading: 90 },
    polyline,
    60,
    { preferredHeading: 90 }
  );
  assert.equal(offRoute.snapped, false);
  assert.ok(offRoute.distanceMeters > 100);
});

test('computeRemainingRouteMeters e resolveActiveNavigationStepIndex atualizam progresso e manobra', () => {
  const polyline = [
    [-28.3920, -49.3935],
    [-28.3910, -49.3935],
    [-28.3910, -49.3925],
  ];
  const remaining = geo.computeRemainingRouteMeters(polyline, 0, -28.3915, -49.3935);
  assert.ok(remaining > 140 && remaining < 170, `restante esperado ~153m, obtido ${remaining}`);

  const steps = [
    { location: [-28.3920, -49.3935] },
    { location: [-28.3910, -49.3935] },
    { location: [-28.3910, -49.3925] },
  ];
  // Ao chegar a ~15m do passo 0, avanca automaticamente para o passo 1
  const res = geo.resolveActiveNavigationStepIndex(steps, 0, -28.3919, -49.3935, 38);
  assert.equal(res.stepIndex, 1);
  assert.ok(res.metersToStep > 80 && res.metersToStep < 120);
});

test('GpsMotionFilter filtra saltos de precisao ruim e faz fusao com bussola quando parado', () => {
  const filter = new compassAndGps.GpsMotionFilter();

  // Fix 1 valido (parado -> usa bussola 120°)
  const fix1 = filter.process(
    {
      coords: {
        latitude: -28.3910,
        longitude: -49.3935,
        accuracy: 10,
        speed: 0,
        heading: null,
      },
      timestamp: 1000,
    },
    120,
    true
  );
  assert.ok(fix1);
  assert.equal(fix1.headingSource, 'compass');
  assert.equal(fix1.heading, 120);

  // Salto ruidoso de torre celular (accuracy 180m) deve ser descartado
  const noisy = filter.process(
    {
      coords: {
        latitude: -28.3950,
        longitude: -49.3980,
        accuracy: 180,
        speed: 0,
        heading: null,
      },
      timestamp: 3000,
    },
    120,
    true
  );
  assert.equal(noisy, null);

  // Movimento real para o Norte sem coords.heading deve calcular bearing (~0°) e convergir suavemente
  const moving1 = filter.process(
    {
      coords: {
        latitude: -28.3905,
        longitude: -49.3935,
        accuracy: 8,
        speed: 8.5,
        heading: null,
      },
      timestamp: 6000,
    },
    120,
    true
  );
  assert.ok(moving1);
  assert.equal(moving1.headingSource, 'bearing');
  assert.equal(moving1.speedKmH, 31);
  assert.ok(moving1.heading < 75 || moving1.heading > 285, `heading suavizado rumo ao Norte, obtido ${moving1.heading}`);

  const moving2 = filter.process(
    {
      coords: {
        latitude: -28.3900,
        longitude: -49.3935,
        accuracy: 8,
        speed: 8.5,
        heading: null,
      },
      timestamp: 8000,
    },
    120,
    true
  );
  assert.ok(moving2);
  assert.equal(moving2.headingSource, 'bearing');
  assert.ok(moving2.heading < 40 || moving2.heading > 320, `heading apos 2a leitura rumo ao Norte, obtido ${moving2.heading}`);
});
