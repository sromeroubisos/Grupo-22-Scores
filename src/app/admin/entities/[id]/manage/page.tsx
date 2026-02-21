export default function EntityManagePage({ params }: any) {
    return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <h2>Gestión de Entidad</h2>
            <p>ID: {params.id}</p>
        </div>
    );
}
