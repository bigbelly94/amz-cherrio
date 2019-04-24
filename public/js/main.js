$(document).ready(function(){
    $('.delete-product').on('click', function(e){
        if (confirm('Are you sure you want to delete this product?')){
            $target = $(e.target);
            const asin = $target.attr('data-id');
            $.ajax({
                type: 'DELETE',
                url: '/product/'+asin,
                success: function(response){
                    window.location.href='/';
                },
                error: function(err){
                    console.log(err);
                }
            });
        };
    });
});


